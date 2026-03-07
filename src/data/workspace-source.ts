import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import { cacheWorkspaceUsers } from "@/data/workspace-profile-cache";
import type { Member, Project, User } from "@/types/entities";
import type { Database as WorkspaceDatabase } from "../../backend-truth/generated/supabase-types";

export type WorkspaceProjectInvite = WorkspaceDatabase["public"]["Tables"]["project_invites"]["Row"];
type ProfileRow = WorkspaceDatabase["public"]["Tables"]["profiles"]["Row"];
type ProjectRow = WorkspaceDatabase["public"]["Tables"]["projects"]["Row"];
type ProjectMemberRow = WorkspaceDatabase["public"]["Tables"]["project_members"]["Row"];
type TypedSupabaseClient = SupabaseClient<WorkspaceDatabase>;

export type WorkspaceMode =
  | { kind: "demo" }
  | { kind: "supabase"; profileId: string };

export interface WorkspaceSource {
  mode: WorkspaceMode["kind"];
  getCurrentUser: () => Promise<User>;
  getProjects: () => Promise<Project[]>;
  getProjectById: (projectId: string) => Promise<Project | undefined>;
  getProjectMembers: (projectId: string) => Promise<Member[]>;
  getProjectInvites: (projectId: string) => Promise<WorkspaceProjectInvite[]>;
}

const SUPABASE_WORKSPACE_SOURCE = "supabase";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const demoWorkspaceSource: WorkspaceSource = {
  mode: "demo",
  async getCurrentUser() {
    return store.getCurrentUser();
  },
  async getProjects() {
    return store.getProjects();
  },
  async getProjectById(projectId: string) {
    return store.getProject(projectId);
  },
  async getProjectMembers(projectId: string) {
    return store.getMembers(projectId);
  },
  async getProjectInvites() {
    return [];
  },
};

export function mapProfileRowToUser(row: ProfileRow): User {
  return {
    id: row.id,
    email: row.email ?? "",
    name: row.full_name ?? row.email ?? "Unknown user",
    avatar: row.avatar_url ?? undefined,
    locale: row.locale,
    timezone: row.timezone,
    plan: row.plan,
    credits_free: row.credits_free,
    credits_paid: row.credits_paid,
  };
}

export function mapProjectRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    owner_id: row.owner_profile_id,
    title: row.title,
    type: row.project_type,
    project_mode: row.project_mode,
    automation_level: row.automation_level,
    current_stage_id: row.current_stage_id ?? "",
    progress_pct: row.progress_pct,
    address: row.address ?? undefined,
    ai_description: row.ai_description ?? undefined,
  };
}

export function mapProjectMemberRowToMember(row: ProjectMemberRow): Member {
  return {
    project_id: row.project_id,
    user_id: row.profile_id,
    role: row.role,
    viewer_regime: row.viewer_regime ?? undefined,
    ai_access: row.ai_access,
    credit_limit: row.credit_limit,
    used_credits: row.used_credits,
  };
}

export function filterActiveProjectRows(rows: ProjectRow[]): ProjectRow[] {
  return rows.filter((row) => row.archived_at == null);
}

export function isSupabaseWorkspaceRequested(): boolean {
  return import.meta.env.VITE_WORKSPACE_SOURCE === SUPABASE_WORKSPACE_SOURCE;
}

export function selectWorkspaceMode(input: {
  requestedSource?: string;
  hasSupabaseConfig: boolean;
  sessionProfileId?: string | null;
}): WorkspaceMode {
  if (input.requestedSource !== SUPABASE_WORKSPACE_SOURCE) {
    return { kind: "demo" };
  }

  if (!input.hasSupabaseConfig || !input.sessionProfileId) {
    return { kind: "demo" };
  }

  return { kind: "supabase", profileId: input.sessionProfileId };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

export async function resolveWorkspaceMode(): Promise<WorkspaceMode> {
  if (!isSupabaseWorkspaceRequested()) {
    return { kind: "demo" };
  }

  const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  if (!hasSupabaseConfig) {
    return { kind: "demo" };
  }

  try {
    const supabase = await loadSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    return selectWorkspaceMode({
      requestedSource: SUPABASE_WORKSPACE_SOURCE,
      hasSupabaseConfig,
      sessionProfileId: error ? null : data.session?.user?.id ?? null,
    });
  } catch {
    return { kind: "demo" };
  }
}

async function loadVisibleProfiles(
  supabase: TypedSupabaseClient,
  profileIds: string[],
): Promise<User[]> {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, locale, timezone, plan, credits_free, credits_paid")
    .in("id", uniqueIds);

  if (error || !data) return [];

  const users = data.map(mapProfileRowToUser);
  cacheWorkspaceUsers(users);
  return users;
}

function createSupabaseWorkspaceSource(
  supabase: TypedSupabaseClient,
  profileId: string,
): WorkspaceSource {
  return {
    mode: "supabase",
    async getCurrentUser() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, locale, timezone, plan, credits_free, credits_paid")
        .eq("id", profileId)
        .maybeSingle();

      if (error || !data) {
        throw error ?? new Error("Current workspace profile not found");
      }

      const user = mapProfileRowToUser(data);
      cacheWorkspaceUsers([user]);
      return user;
    },

    async getProjects() {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("archived_at", null)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return filterActiveProjectRows(data ?? []).map(mapProjectRowToProject);
    },

    async getProjectById(projectId: string) {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .is("archived_at", null)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return undefined;
      }

      await loadVisibleProfiles(supabase, [data.owner_profile_id]);
      return mapProjectRowToProject(data);
    },

    async getProjectMembers(projectId: string) {
      const { data, error } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId)
        .order("joined_at", { ascending: true });

      if (error) {
        throw error;
      }

      const rows = data ?? [];
      await loadVisibleProfiles(supabase, rows.map((row) => row.profile_id));
      return rows.map(mapProjectMemberRowToMember);
    },

    async getProjectInvites(projectId: string) {
      const { data, error } = await supabase
        .from("project_invites")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  };
}

export async function getWorkspaceSource(
  mode?: WorkspaceMode,
): Promise<WorkspaceSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return demoWorkspaceSource;
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseWorkspaceSource(supabase, resolvedMode.profileId);
}
