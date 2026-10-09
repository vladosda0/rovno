import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import { resolveWorkspaceMode, type WorkspaceMode } from "@/data/workspace-source";
import type { Database as BriefingDatabase } from "../../backend-truth/generated/supabase-types";

type TypedSupabaseClient = SupabaseClient<BriefingDatabase>;
type PreferencesInsert = BriefingDatabase["public"]["Tables"]["notification_preferences"]["Insert"];

/** The briefing columns of `notification_preferences`. */
export interface BriefingSettings {
  enabled: boolean;
  /** Minutes from midnight in the person's zone, a half-hour slot: 540 is 09:00. */
  minute: number;
  weekends: boolean;
}

/** What a person without a preferences row gets; the same values the columns default to. */
export const DEFAULT_BRIEFING_SETTINGS: BriefingSettings = { enabled: true, minute: 540, weekends: false };

export const BRIEFING_MINUTE_STEP = 30;
const MINUTES_IN_DAY = 24 * 60;
const BRIEFING_ROLES = new Set(["owner", "co_owner"]);
const UNIQUE_VIOLATION = "23505";
const LOCAL_SETTINGS_KEY = "briefing-settings";
const LOCAL_MUTES_KEY = "briefing-muted-projects";

export interface BriefingProject {
  id: string;
  title: string;
}

export interface BriefingSettingsSnapshot {
  settings: BriefingSettings;
  /** The projects a briefing can come for: those where the person is the owner or a co-owner. */
  projects: BriefingProject[];
  /** False for a person with no project of any kind; a mere member of one still has `projects` empty. */
  inAnyProject: boolean;
  /** A briefing comes for every project of the person except these. */
  mutedProjectIds: string[];
}

export interface BriefingSettingsSource {
  mode: WorkspaceMode["kind"];
  load: () => Promise<BriefingSettingsSnapshot>;
  /** Writes the given fields only; the first write creates the person's row. */
  saveSettings: (patch: Partial<BriefingSettings>) => Promise<void>;
  setProjectMuted: (projectId: string, muted: boolean) => Promise<void>;
}

export function isBriefingMinute(minute: number): boolean {
  return Number.isInteger(minute) && minute >= 0 && minute < MINUTES_IN_DAY && minute % BRIEFING_MINUTE_STEP === 0;
}

function assertBriefingMinute(patch: Partial<BriefingSettings>): void {
  if (patch.minute !== undefined && !isBriefingMinute(patch.minute)) {
    throw new Error(`Not a half-hour slot of the day: ${patch.minute}`);
  }
}

function readLocalJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readLocalSettings(): BriefingSettings {
  const raw = readLocalJson(LOCAL_SETTINGS_KEY);
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_BRIEFING_SETTINGS.enabled,
    minute: typeof record.minute === "number" && isBriefingMinute(record.minute) ? record.minute : DEFAULT_BRIEFING_SETTINGS.minute,
    weekends: typeof record.weekends === "boolean" ? record.weekends : DEFAULT_BRIEFING_SETTINGS.weekends,
  };
}

function readLocalMutes(): string[] {
  const raw = readLocalJson(LOCAL_MUTES_KEY);
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/** No backend: nothing is ever sent, the choices just stay on this device. */
export function createBrowserBriefingSettingsSource(mode: "demo" | "local"): BriefingSettingsSource {
  return {
    mode,
    async load() {
      const userId = store.getCurrentUserForMode(mode).id;
      const visible = store.getProjectsForMode(mode);
      const projects = visible.filter((project) =>
        project.owner_id === userId
        || store.getMembersForMode(mode, project.id).some((member) => member.user_id === userId && BRIEFING_ROLES.has(member.role)),
      );
      return {
        settings: readLocalSettings(),
        projects: projects.map((project) => ({ id: project.id, title: project.title })),
        inAnyProject: visible.length > 0,
        mutedProjectIds: readLocalMutes(),
      };
    },
    async saveSettings(patch) {
      assertBriefingMinute(patch);
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ ...readLocalSettings(), ...patch }));
    },
    async setProjectMuted(projectId, muted) {
      const others = readLocalMutes().filter((id) => id !== projectId);
      localStorage.setItem(LOCAL_MUTES_KEY, JSON.stringify(muted ? [...others, projectId] : others));
    },
  };
}

export function createSupabaseBriefingSettingsSource(
  supabase: TypedSupabaseClient,
  profileId: string,
): BriefingSettingsSource {
  return {
    mode: "supabase",
    async load() {
      const [preferences, projects, memberships, mutes] = await Promise.all([
        supabase
          .from("notification_preferences")
          .select("briefing_enabled, briefing_minute, briefing_weekends")
          .eq("profile_id", profileId)
          .maybeSingle(),
        supabase
          .from("projects")
          .select("id, title, owner_profile_id")
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
        supabase.from("project_members").select("project_id, role").eq("profile_id", profileId),
        supabase.from("notification_project_mutes").select("project_id").eq("profile_id", profileId),
      ]);
      const error = preferences.error ?? projects.error ?? memberships.error ?? mutes.error;
      if (error) {
        throw error;
      }

      // The same rule the server applies when it decides whom a briefing is written for.
      const managed = new Set(
        (memberships.data ?? []).filter((member) => BRIEFING_ROLES.has(member.role)).map((member) => member.project_id),
      );
      return {
        settings: preferences.data
          ? {
            enabled: preferences.data.briefing_enabled,
            minute: preferences.data.briefing_minute,
            weekends: preferences.data.briefing_weekends,
          }
          : DEFAULT_BRIEFING_SETTINGS,
        projects: (projects.data ?? [])
          .filter((project) => project.owner_profile_id === profileId || managed.has(project.id))
          .map((project) => ({ id: project.id, title: project.title })),
        inAnyProject: (projects.data ?? []).length > 0,
        mutedProjectIds: (mutes.data ?? []).map((mute) => mute.project_id),
      };
    },
    async saveSettings(patch) {
      assertBriefingMinute(patch);
      const row: PreferencesInsert = { profile_id: profileId };
      if (patch.enabled !== undefined) row.briefing_enabled = patch.enabled;
      if (patch.minute !== undefined) row.briefing_minute = patch.minute;
      if (patch.weekends !== undefined) row.briefing_weekends = patch.weekends;

      const { error } = await supabase.from("notification_preferences").upsert(row, { onConflict: "profile_id" });
      if (error) {
        throw error;
      }
    },
    async setProjectMuted(projectId, muted) {
      if (muted) {
        const { error } = await supabase
          .from("notification_project_mutes")
          .insert({ profile_id: profileId, project_id: projectId });
        // Already off, from another tab or device: the row the person asked for is there.
        if (error && error.code !== UNIQUE_VIOLATION) {
          throw error;
        }
        return;
      }

      const { error } = await supabase
        .from("notification_project_mutes")
        .delete()
        .eq("profile_id", profileId)
        .eq("project_id", projectId);
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

export async function getBriefingSettingsSource(mode?: WorkspaceMode): Promise<BriefingSettingsSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserBriefingSettingsSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseBriefingSettingsSource(supabase, resolvedMode.profileId);
}
