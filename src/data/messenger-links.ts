import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// The bot-identity RPCs (create_link_code, list_my_linked_identities,
// unlink_identity) live outside the generated Database type — the bot-identity
// migrations are intentionally excluded from backend-truth — so we reach them
// through an untyped client, the same pattern as billing.ts / org-source.ts.
const rawSupabase = supabase as unknown as SupabaseClient;

export type MessengerProvider = "telegram" | "max";

export interface LinkedIdentity {
  provider: MessengerProvider;
  username: string | null;
  displayName: string | null;
  linkedAt: string;
}

// Staging and prod share the same bot handle (@rovno_ai_bot). The bot accepts
// `/link <code>` and the `/start <code>` deep-link alias.
export const TELEGRAM_BOT_USERNAME = "rovno_ai_bot";

// Feature flag for the Settings → Интеграции (Telegram linking) tab. Default
// false. @rovno_ai_bot consumes link codes against a single Supabase project;
// until a prod bot pointed at api.rovno.ai ships, a prod-minted code can never
// be consumed (cross-environment dead end), so the tab stays hidden on prod.
// Flip VITE_TELEGRAM_LINKING_ENABLED=true only in an env whose bot targets that
// env's database.
export const TELEGRAM_LINKING_ENABLED =
  import.meta.env.VITE_TELEGRAM_LINKING_ENABLED === "true";

export function telegramDeepLink(code: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

interface LinkedIdentityRow {
  provider: string;
  username: string | null;
  display_name: string | null;
  linked_at: string;
}

// Mint a short, single-use link code (15-minute TTL) for the given channel.
// The user then sends it to the bot, which finalizes via consume_link_code.
export async function createLinkCode(provider: MessengerProvider): Promise<string> {
  const { data, error } = await rawSupabase.rpc("create_link_code", { p_channel: provider });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("create_link_code returned an empty code");
  }
  return data;
}

// List the current user's linked messenger identities (scoped to auth.uid()
// server-side). Raw external_id is never returned by the RPC.
export async function listLinkedIdentities(): Promise<LinkedIdentity[]> {
  const { data, error } = await rawSupabase.rpc("list_my_linked_identities");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LinkedIdentityRow[];
  return rows.map((r) => ({
    provider: r.provider === "max" ? "max" : "telegram",
    username: r.username,
    displayName: r.display_name,
    linkedAt: r.linked_at,
  }));
}

// Disconnect the current user's identity for the given provider. Idempotent.
export async function unlinkIdentity(provider: MessengerProvider): Promise<void> {
  const { error } = await rawSupabase.rpc("unlink_identity", { p_provider: provider });
  if (error) throw new Error(error.message);
}
