import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  getWorkspaceSource,
  hasSupabaseWorkspaceConfig,
  isSupabaseWorkspaceRequested,
  resolveWorkspaceMode,
  type WorkspaceMode,
  type WorkspaceProjectInvite,
} from "@/data/workspace-source";
import type { Member, Project, User } from "@/types/entities";
import * as store from "@/data/store";
import {
  getAuthStateSnapshot,
  isDemoSessionActive,
  isSimulatedAuthenticated,
  subscribeAuthState,
} from "@/lib/auth-state";

const WORKSPACE_QUERY_STALE_TIME_MS = 60_000;

type PendingWorkspaceMode = { kind: "pending-supabase" };
export type WorkspaceModeState = WorkspaceMode | PendingWorkspaceMode;
export type WorkspaceRuntimeKind = "demo" | "local" | "supabase";

export interface WorkspaceRuntimeAuthState {
  authPending: boolean;
  canAccessWorkspace: boolean;
  isGuest: boolean;
  runtimeKind: WorkspaceRuntimeKind;
}

export const EMPTY_WORKSPACE_USER: User = {
  id: "",
  email: "",
  name: "",
  locale: "en",
  timezone: "UTC",
  plan: "free",
  credits_free: 0,
  credits_paid: 0,
};

export const workspaceQueryKeys = {
  mode: () => ["workspace", "mode"] as const,
  currentUser: (profileId: string) => ["workspace", "current-user", profileId] as const,
  projects: (profileId: string) => ["workspace", "projects", profileId] as const,
  project: (profileId: string, projectId: string) => ["workspace", "project", profileId, projectId] as const,
  projectMembers: (profileId: string, projectId: string) => ["workspace", "project-members", profileId, projectId] as const,
  projectInvites: (profileId: string, projectId: string) => ["workspace", "project-invites", profileId, projectId] as const,
};

export function selectWorkspaceRuntimeAuthState(input: {
  hasSupabaseConfig: boolean;
  localCompatibilityAuthenticated: boolean;
  mode: WorkspaceModeState;
  supabaseRequested: boolean;
}): WorkspaceRuntimeAuthState {
  if (input.mode.kind === "demo") {
    return {
      authPending: false,
      canAccessWorkspace: true,
      isGuest: !input.localCompatibilityAuthenticated,
      runtimeKind: "demo",
    };
  }

  if (!input.supabaseRequested || !input.hasSupabaseConfig) {
    return {
      authPending: false,
      canAccessWorkspace: true,
      isGuest: !input.localCompatibilityAuthenticated,
      runtimeKind: "local",
    };
  }

  if (input.mode.kind === "pending-supabase") {
    return {
      authPending: true,
      canAccessWorkspace: false,
      isGuest: false,
      runtimeKind: "supabase",
    };
  }

  if (input.mode.kind === "supabase") {
    return {
      authPending: false,
      canAccessWorkspace: true,
      isGuest: false,
      runtimeKind: "supabase",
    };
  }

  return {
    authPending: false,
    canAccessWorkspace: false,
    isGuest: true,
    runtimeKind: "supabase",
  };
}

function useWorkspaceModeState(): WorkspaceModeState {
  useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot);
  const demoSessionActive = isDemoSessionActive();
  const supabaseRequested = !demoSessionActive && isSupabaseWorkspaceRequested();
  const supabaseEnabled = supabaseRequested && hasSupabaseWorkspaceConfig();
  const modeQuery = useQuery({
    queryKey: workspaceQueryKeys.mode(),
    queryFn: resolveWorkspaceMode,
    enabled: supabaseEnabled,
    staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
  });

  if (demoSessionActive) {
    return { kind: "demo" };
  }

  if (!supabaseEnabled) {
    return { kind: "local" };
  }

  return modeQuery.data ?? { kind: "pending-supabase" };
}

export function useWorkspaceMode(): WorkspaceModeState {
  return useWorkspaceModeState();
}

export function useWorkspaceRuntimeAuth(): WorkspaceRuntimeAuthState {
  const mode = useWorkspaceModeState();

  return selectWorkspaceRuntimeAuthState({
    hasSupabaseConfig: hasSupabaseWorkspaceConfig(),
    localCompatibilityAuthenticated: isSimulatedAuthenticated(),
    mode,
    supabaseRequested: isSupabaseWorkspaceRequested(),
  });
}

export function useWorkspaceCurrentUser(): User {
  const mode = useWorkspaceModeState();
  const runtimeAuth = selectWorkspaceRuntimeAuthState({
    hasSupabaseConfig: hasSupabaseWorkspaceConfig(),
    localCompatibilityAuthenticated: isSimulatedAuthenticated(),
    mode,
    supabaseRequested: isSupabaseWorkspaceRequested(),
  });
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const userQuery = useQuery({
    queryKey: supabaseMode
      ? workspaceQueryKeys.currentUser(supabaseMode.profileId)
      : workspaceQueryKeys.currentUser("demo"),
    queryFn: async () => {
      const source = await getWorkspaceSource(supabaseMode ?? undefined);
      return source.getCurrentUser();
    },
    enabled: Boolean(supabaseMode),
    staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
  });

  if (runtimeAuth.runtimeKind === "demo" || runtimeAuth.runtimeKind === "local") {
    return store.getCurrentUser();
  }

  return userQuery.data ?? EMPTY_WORKSPACE_USER;
}

export function useWorkspaceProjects(): Project[] {
  const mode = useWorkspaceModeState();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const projectsQuery = useQuery({
    queryKey: supabaseMode
      ? workspaceQueryKeys.projects(supabaseMode.profileId)
      : workspaceQueryKeys.projects("demo"),
    queryFn: async () => {
      const source = await getWorkspaceSource(supabaseMode ?? undefined);
      return source.getProjects();
    },
    enabled: Boolean(supabaseMode),
    staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return store.getProjects();
  }

  return projectsQuery.data ?? [];
}

export function useWorkspaceProject(projectId: string): Project | undefined {
  const mode = useWorkspaceModeState();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const projectQuery = useQuery({
    queryKey: supabaseMode
      ? workspaceQueryKeys.project(supabaseMode.profileId, projectId)
      : workspaceQueryKeys.project("demo", projectId),
    queryFn: async () => {
      const source = await getWorkspaceSource(supabaseMode ?? undefined);
      return source.getProjectById(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return store.getProject(projectId);
  }

  return projectQuery.data;
}

export function useWorkspaceProjectMembers(projectId: string): Member[] {
  const mode = useWorkspaceModeState();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const membersQuery = useQuery({
    queryKey: supabaseMode
      ? workspaceQueryKeys.projectMembers(supabaseMode.profileId, projectId)
      : workspaceQueryKeys.projectMembers("demo", projectId),
    queryFn: async () => {
      const source = await getWorkspaceSource(supabaseMode ?? undefined);
      return source.getProjectMembers(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return store.getMembers(projectId);
  }

  return membersQuery.data ?? [];
}

export function useWorkspaceProjectInvites(projectId: string): WorkspaceProjectInvite[] {
  const mode = useWorkspaceModeState();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const invitesQuery = useQuery({
    queryKey: supabaseMode
      ? workspaceQueryKeys.projectInvites(supabaseMode.profileId, projectId)
      : workspaceQueryKeys.projectInvites("demo", projectId),
    queryFn: async () => {
      const source = await getWorkspaceSource(supabaseMode ?? undefined);
      return source.getProjectInvites(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return store.getProjectInvites(projectId);
  }

  if (!supabaseMode) {
    return [];
  }

  return invitesQuery.data ?? [];
}
