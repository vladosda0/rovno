import { useSyncExternalStore } from "react";
import { useQueries } from "@tanstack/react-query";
import { getAuthRole, subscribeAuthState } from "@/lib/auth-state";
import {
  getWorkspaceSource,
  type WorkspaceMode,
} from "@/data/workspace-source";
import * as store from "@/data/store";
import {
  applyWorkspaceDemoOverlayToSeam,
  buildProjectAuthoritySeam,
  seamCanViewSensitiveDetail,
} from "@/lib/permissions";
import type { Member, Project } from "@/types/entities";
import {
  useWorkspaceCurrentUser,
  useWorkspaceMode,
  useWorkspaceProjects,
  workspaceQueryKeys,
  type WorkspaceModeState,
} from "@/hooks/use-workspace-source";

const WORKSPACE_QUERY_STALE_TIME_MS = 60_000;

const EMPTY_DETAIL_MAP: ReadonlyMap<string, boolean> = new Map();

function resolveCanViewForProject(
  project: Pick<Project, "id">,
  profileId: string,
  members: Member[],
  projectRow: Project | undefined,
  workspaceMode: WorkspaceModeState,
): boolean {
  const seam = buildProjectAuthoritySeam({
    projectId: project.id,
    profileId,
    members,
    project: projectRow,
  });
  const effective = applyWorkspaceDemoOverlayToSeam(seam, workspaceMode);
  return seamCanViewSensitiveDetail(effective);
}

/**
 * Per-project `seamCanViewSensitiveDetail` for all workspace projects (Home finance/procurement gating).
 * Fail closed while Supabase project/member rows are loading.
 */
export function useWorkspaceProjectsSensitiveDetailMap(): {
  canViewSensitiveDetailByProjectId: ReadonlyMap<string, boolean>;
  isLoading: boolean;
} {
  const workspaceMode = useWorkspaceMode();
  const workspaceHookProjects = useWorkspaceProjects();
  const user = useWorkspaceCurrentUser();
  /** Re-render when demo auth simulator role changes (workspace mode snapshot may stay "demo"). */
  useSyncExternalStore(subscribeAuthState, getAuthRole);

  /** Align with finance/procurement read models: demo/local use the browser store, not an empty Supabase project list. */
  const projects =
    workspaceMode.kind === "demo" || workspaceMode.kind === "local"
      ? store.getProjects()
      : workspaceHookProjects;

  const projectIds = projects.map((p) => p.id);

  const supabaseMode: WorkspaceMode | null =
    workspaceMode.kind === "supabase" ? workspaceMode : null;
  const supabaseEnabled = Boolean(supabaseMode && projectIds.length > 0);

  const membersQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: supabaseMode
        ? workspaceQueryKeys.projectMembers(supabaseMode.profileId, projectId)
        : workspaceQueryKeys.projectMembers("demo", projectId),
      queryFn: async () => {
        const source = await getWorkspaceSource(supabaseMode ?? undefined);
        return source.getProjectMembers(projectId);
      },
      enabled: supabaseEnabled,
      staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
    })),
  });

  const projectQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: supabaseMode
        ? workspaceQueryKeys.project(supabaseMode.profileId, projectId)
        : workspaceQueryKeys.project("demo", projectId),
      queryFn: async () => {
        const source = await getWorkspaceSource(supabaseMode ?? undefined);
        return source.getProjectById(projectId);
      },
      enabled: supabaseEnabled,
      staleTime: WORKSPACE_QUERY_STALE_TIME_MS,
    })),
  });

  if (workspaceMode.kind === "pending-supabase") {
    return { canViewSensitiveDetailByProjectId: EMPTY_DETAIL_MAP, isLoading: true };
  }

  if (workspaceMode.kind === "demo" || workspaceMode.kind === "local") {
    const map = new Map<string, boolean>();
    for (const project of projects) {
      const members = store.getMembers(project.id);
      const projectRow = store.getProject(project.id);
      map.set(
        project.id,
        resolveCanViewForProject(project, user.id, members, projectRow, workspaceMode),
      );
    }
    return { canViewSensitiveDetailByProjectId: map, isLoading: false };
  }

  if (workspaceMode.kind !== "supabase") {
    return { canViewSensitiveDetailByProjectId: EMPTY_DETAIL_MAP, isLoading: false };
  }

  const membersLoading = membersQueries.some((q) => q.isPending);
  const projectLoading = projectQueries.some((q) => q.isPending);
  if (membersLoading || projectLoading) {
    return { canViewSensitiveDetailByProjectId: EMPTY_DETAIL_MAP, isLoading: true };
  }

  const map = new Map<string, boolean>();
  projectIds.forEach((projectId, index) => {
    const members = membersQueries[index]?.data ?? [];
    const projectRow = projectQueries[index]?.data;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    map.set(
      projectId,
      resolveCanViewForProject(project, user.id, members, projectRow, workspaceMode),
    );
  });
  return { canViewSensitiveDetailByProjectId: map, isLoading: false };
}
