import type { SupabaseClient } from "@supabase/supabase-js";
import { listLinkedIdentities } from "@/data/messenger-links";
import { resolveWorkspaceMode, type WorkspaceMode } from "@/data/workspace-source";
import type { Database as DeliveryDatabase } from "../../backend-truth/generated/supabase-types";

type TypedSupabaseClient = SupabaseClient<DeliveryDatabase>;
type PreferencesInsert = DeliveryDatabase["public"]["Tables"]["notification_preferences"]["Insert"];

/** The Telegram columns of `notification_preferences`. */
export interface TelegramDeliverySettings {
  enabled: boolean;
  quietNight: boolean;
}

/** What a person without a preferences row gets; the same values the columns default to. */
export const DEFAULT_TELEGRAM_DELIVERY_SETTINGS: TelegramDeliverySettings = { enabled: true, quietNight: true };

export interface TelegramDeliverySnapshot {
  /** How the linked account is named on screen; null when no Telegram is linked. */
  linkedName: string | null;
  linked: boolean;
  settings: TelegramDeliverySettings;
}

export interface TelegramDeliverySource {
  load: () => Promise<TelegramDeliverySnapshot>;
  /** Writes the given fields only; the first write creates the person's row. */
  saveSettings: (patch: Partial<TelegramDeliverySettings>) => Promise<void>;
}

export function createSupabaseTelegramDeliverySource(
  supabase: TypedSupabaseClient,
  profileId: string,
  listIdentities: typeof listLinkedIdentities = listLinkedIdentities,
): TelegramDeliverySource {
  return {
    async load() {
      const [preferences, identities] = await Promise.all([
        supabase
          .from("notification_preferences")
          .select("telegram_enabled, telegram_quiet_night")
          .eq("profile_id", profileId)
          .maybeSingle(),
        listIdentities(),
      ]);
      if (preferences.error) {
        throw preferences.error;
      }

      const telegram = identities.find((identity) => identity.provider === "telegram") ?? null;
      return {
        linked: telegram !== null,
        linkedName: telegram ? (telegram.username ? `@${telegram.username}` : telegram.displayName) : null,
        settings: preferences.data
          ? { enabled: preferences.data.telegram_enabled, quietNight: preferences.data.telegram_quiet_night }
          : DEFAULT_TELEGRAM_DELIVERY_SETTINGS,
      };
    },
    async saveSettings(patch) {
      const row: PreferencesInsert = { profile_id: profileId };
      if (patch.enabled !== undefined) row.telegram_enabled = patch.enabled;
      if (patch.quietNight !== undefined) row.telegram_quiet_night = patch.quietNight;

      const { error } = await supabase.from("notification_preferences").upsert(row, { onConflict: "profile_id" });
      if (error) {
        throw error;
      }
    },
  };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

/** Telegram delivery exists only for a signed-in person; null in demo and local modes. */
export async function getTelegramDeliverySource(mode?: WorkspaceMode): Promise<TelegramDeliverySource | null> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return null;
  }
  return createSupabaseTelegramDeliverySource(await loadSupabaseClient(), resolvedMode.profileId);
}
