import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import { cacheWorkspaceUsers } from "@/data/workspace-profile-cache";
import type { Member, Project, User } from "@/types/entities";
import { isDemoSessionActive } from "@/lib/auth-state";
import type { Database as WorkspaceDatabase } from "../../backend-truth/generated/supabase-types";

export type WorkspaceProjectInvite = WorkspaceDatabase["public"]["Tables"]["project_invites"]["Row"];
type ProfileRow = WorkspaceDatabase["public"]["Tables"]["profiles"]["Row"];
type ProjectRow = WorkspaceDatabase["public"]["Tables"]["projects"]["Row"];
type ProjectMemberRow = WorkspaceDatabase["public"]["Tables"]["project_members"]["Row"];
type TypedSupabaseClient = SupabaseClient<WorkspaceDatabase>;

export type WorkspaceMode =
  | { kind: "demo" }
  | { kind: "local" }
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

function createBrowserWorkspaceSource(mode: store.BrowserWorkspaceKind): WorkspaceSource {
  return {
    mode,
    async getCurrentUser() {
      return store.getCurrentUserForMode(mode);
    },
    async getProjects() {
      return store.getProjectsForMode(mode);
    },
    async getProjectById(projectId: string) {
      return store.getProjectForMode(mode, projectId);
    },
    async getProjectMembers(projectId: string) {
      return store.getMembersForMode(mode, projectId);
    },
    async getProjectInvites(projectId: string) {
      return store.getProjectInvitesForMode(mode, projectId);
    },
  };
}

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

export function hasSupabaseWorkspaceConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function selectWorkspaceMode(input: {
  requestedSource?: string;
  hasSupabaseConfig: boolean;
  sessionProfileId?: string | null;
  demoSessionActive?: boolean;
}): WorkspaceMode {
  if (input.demoSessionActive) {
    return { kind: "demo" };
  }

  if (input.requestedSource !== SUPABASE_WORKSPACE_SOURCE) {
    return { kind: "local" };
  }

  if (!input.hasSupabaseConfig || !input.sessionProfileId) {
    return { kind: "local" };
  }

  return { kind: "supabase", profileId: input.sessionProfileId };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

export async function resolveWorkspaceMode(): Promise<WorkspaceMode> {
  if (isDemoSessionActive()) {
    return { kind: "demo" };
  }

  if (!isSupabaseWorkspaceRequested()) {
    return { kind: "local" };
  }

  const hasSupabaseConfig = hasSupabaseWorkspaceConfig();
  if (!hasSupabaseConfig) {
    return { kind: "local" };
  }

  try {
    const supabase = await loadSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    return selectWorkspaceMode({
      requestedSource: SUPABASE_WORKSPACE_SOURCE,
      hasSupabaseConfig,
      sessionProfileId: error ? null : data.session?.user?.id ?? null,
      demoSessionActive: false,
    });
  } catch {
    return { kind: "local" };
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

      const rows = data ?? [];
      await loadVisibleProfiles(supabase, rows.flatMap((row) => [row.invited_by, row.accepted_profile_id ?? ""]));
      return rows;
    },
  };
}

export async function getWorkspaceSource(
  mode?: WorkspaceMode,
): Promise<WorkspaceSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind === "demo" || resolvedMode.kind === "local") {
    return createBrowserWorkspaceSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseWorkspaceSource(supabase, resolvedMode.profileId);
}

export async function createWorkspaceProject(
  mode: WorkspaceMode,
  input: {
    title: string;
    type: Project["type"];
    projectMode: Project["project_mode"];
    ownerId: string;
  },
  options: {
    bootstrapLocalProject?: boolean;
  } = {},
): Promise<Project> {
  if (mode.kind !== "supabase") {
    const timestamp = Date.now();
    const projectId = `project-manual-${timestamp}`;
    const shouldBootstrapLocalProject = options.bootstrapLocalProject !== false;
    const stageId = shouldBootstrapLocalProject ? `stage-manual-${timestamp}-0` : "";
    const project: Project = {
      id: projectId,
      owner_id: input.ownerId,
      title: input.title,
      type: input.type,
      project_mode: input.projectMode,
      automation_level: "manual",
      current_stage_id: stageId,
      progress_pct: 0,
    };

    store.addProject(project);
    store.addMember({
      project_id: projectId,
      user_id: input.ownerId,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });

    if (shouldBootstrapLocalProject) {
      store.addStage({
        id: stageId,
        project_id: projectId,
        title: "Stage 1",
        description: "",
        order: 1,
        status: "open",
      });
      store.addEvent({
        id: `evt-manual-${timestamp}`,
        project_id: projectId,
        actor_id: input.ownerId,
        type: "project_created",
        object_type: "project",
        object_id: projectId,
        timestamp: new Date().toISOString(),
        payload: { title: input.title },
      });
      store.addEvent({
        id: `evt-project-mode-${timestamp}`,
        project_id: projectId,
        actor_id: input.ownerId,
        type: "estimate.project_mode_set",
        object_type: "estimate_v2_project",
        object_id: projectId,
        timestamp: new Date().toISOString(),
        payload: { projectMode: input.projectMode },
      });
    }

    return project;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_profile_id: input.ownerId,
      title: input.title,
      project_type: input.type,
      project_mode: input.projectMode,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create workspace project");
  }

  return mapProjectRowToProject(data);
}

export async function updateWorkspaceProjectMemberRole(
  mode: WorkspaceMode,
  input: {
    projectId: string;
    userId: string;
    role: Member["role"];
    viewerRegime?: Member["viewer_regime"];
  },
): Promise<Member> {
  if (mode.kind !== "supabase") {
    const updated = store.updateMember(input.projectId, input.userId, {
      role: input.role,
      viewer_regime: input.viewerRegime,
    }, mode.kind);
    if (!updated) {
      throw new Error("Project member not found");
    }
    return updated;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("project_members")
    .update({
      role: input.role,
      viewer_regime: input.viewerRegime ?? null,
    })
    .eq("project_id", input.projectId)
    .eq("profile_id", input.userId)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to update project member");
  }

  return mapProjectMemberRowToMember(data);
}

export async function createWorkspaceProjectInvite(
  mode: WorkspaceMode,
  input: {
    projectId: string;
    email: string;
    role: WorkspaceProjectInvite["role"];
    aiAccess: WorkspaceProjectInvite["ai_access"];
    viewerRegime: WorkspaceProjectInvite["viewer_regime"];
    creditLimit: number;
    invitedBy: string;
  },
): Promise<WorkspaceProjectInvite> {
  if (mode.kind !== "supabase") {
    const invite: WorkspaceProjectInvite = {
      id: `invite-${Date.now()}`,
      project_id: input.projectId,
      email: input.email.trim(),
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime ?? null,
      credit_limit: input.creditLimit,
      invited_by: input.invitedBy,
      status: "pending",
      invite_token: `invite-token-${Date.now()}`,
      accepted_profile_id: null,
      created_at: new Date().toISOString(),
      accepted_at: null,
    };
    store.addProjectInvite(invite, mode.kind);
    return invite;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("project_invites")
    .insert({
      project_id: input.projectId,
      email: input.email.trim(),
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime ?? null,
      credit_limit: input.creditLimit,
      invited_by: input.invitedBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create project invite");
  }

  return data;
}

export async function updateWorkspaceProjectInvite(
  mode: WorkspaceMode,
  input: {
    id: string;
    projectId: string;
    role?: WorkspaceProjectInvite["role"];
    aiAccess?: WorkspaceProjectInvite["ai_access"];
    viewerRegime?: WorkspaceProjectInvite["viewer_regime"];
    creditLimit?: number;
    status?: WorkspaceProjectInvite["status"];
  },
): Promise<WorkspaceProjectInvite> {
  if (mode.kind !== "supabase") {
    const updated = store.updateProjectInvite(input.id, {
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime,
      credit_limit: input.creditLimit,
      status: input.status,
    }, mode.kind);
    if (!updated) {
      throw new Error("Project invite not found");
    }
    return updated;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("project_invites")
    .update({
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime ?? null,
      credit_limit: input.creditLimit,
      status: input.status,
    })
    .eq("id", input.id)
    .eq("project_id", input.projectId)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to update project invite");
  }

  return data;
}
