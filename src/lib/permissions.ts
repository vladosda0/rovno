import { useMemo } from "react";
import {
  useWorkspaceCurrentUser,
  useWorkspaceMode,
  useWorkspaceProjectState,
  useWorkspaceProjectMembersState,
} from "@/hooks/use-workspace-source";
import { can, type Action } from "@/lib/permission-matrix";
import {
  buildProjectAuthoritySeam,
  type ProjectAuthoritySeam,
} from "@/lib/project-authority-seam";
import { getAuthRole } from "@/lib/auth-state";
import type { MemberRole } from "@/types/entities";

export type { Action } from "@/lib/permission-matrix";
export { can, isOwnerOrCoOwner } from "@/lib/permission-matrix";
export type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
export { buildProjectAuthoritySeam } from "@/lib/project-authority-seam";

export type ProjectDomain =
  | "participants"
  | "invites"
  | "permissions"
  | "estimate"
  | "tasks"
  | "procurement"
  | "hr"
  | "documents"
  | "gallery"
  | "comments";

export type ProjectDomainAccess = "hidden" | "view" | "contribute" | "summary" | "manage";

export function getProjectRole(seam: ProjectAuthoritySeam): MemberRole {
  if (seam.membership?.role) return seam.membership.role;
  if (seam.project?.owner_id === seam.profileId) return "owner";
  return "viewer";
}

export function getProjectDomainAccessForRole(
  role: MemberRole,
  domain: ProjectDomain,
): ProjectDomainAccess {
  switch (domain) {
    case "participants":
    case "invites":
    case "permissions":
      return role === "owner" || role === "co_owner" ? "manage" : "hidden";
    case "estimate":
      return role === "owner" || role === "co_owner" ? "manage" : "view";
    case "tasks":
    case "documents":
    case "gallery":
    case "comments":
      if (role === "owner" || role === "co_owner") return "manage";
      return role === "contractor" ? "contribute" : "view";
    case "procurement":
      return role === "owner" || role === "co_owner" ? "manage" : "summary";
    case "hr":
      return role === "owner" || role === "co_owner" ? "manage" : "hidden";
    default:
      return "hidden";
  }
}

export function getProjectDomainAccess(
  seam: ProjectAuthoritySeam,
  domain: ProjectDomain,
): ProjectDomainAccess {
  return getProjectDomainAccessForRole(getProjectRole(seam), domain);
}

export function projectDomainAllowsView(access: ProjectDomainAccess): boolean {
  return access !== "hidden";
}

export function projectDomainAllowsContribute(access: ProjectDomainAccess): boolean {
  return access === "contribute" || access === "manage";
}

export function projectDomainAllowsManage(access: ProjectDomainAccess): boolean {
  return access === "manage";
}

export function projectDomainAllowsRoute(
  seam: ProjectAuthoritySeam,
  domain: ProjectDomain | null,
): boolean {
  if (!domain) return true;
  return projectDomainAllowsView(getProjectDomainAccess(seam, domain));
}

/** UI and non-React callers (e.g. AI commit) should use this instead of re-lookup in the demo store alone. */
export function seamAllowsAction(seam: ProjectAuthoritySeam, action: Action): boolean {
  const role = getProjectRole(seam);
  const aiAccess = seam.membership?.ai_access ?? "none";
  return can(role, action, aiAccess);
}

/**
 * Backend-aligned UX gate for “sensitive detail” module visibility.
 *
 * Backend RLS uses `public.can_view_sensitive_detail(project_id)`, which is derived
 * from `effective_finance_visibility(project_id)` and therefore:
 * - owner always has access
 * - others have access iff their stored `finance_visibility` is `detail`
 *
 * Contract drift / UX safety:
 * - when membership is unknown (no membership row) return `true` (avoid over-hiding)
 * - when `finance_visibility` is missing in demo/local data, return `true`
 *   so we don't hide modules due to incomplete local seeding.
 */
export function seamCanViewSensitiveDetail(seam: ProjectAuthoritySeam): boolean {
  if (!seam.membership) return true;
  if (seam.membership.role === "owner") return true;

  const financeVisibility = seam.membership.finance_visibility;
  if (financeVisibility == null) return true;

  return financeVisibility === "detail";
}

export function usePermission(projectId: string) {
  const user = useWorkspaceCurrentUser();
  const workspaceMode = useWorkspaceMode();
  const { members, isLoading: isMembersLoading } = useWorkspaceProjectMembersState(projectId);
  const { project, isLoading: isProjectLoading } = useWorkspaceProjectState(projectId);

  const seam = useMemo(
    () =>
      buildProjectAuthoritySeam({
        projectId,
        profileId: user.id,
        members,
        project,
      }),
    [projectId, user.id, members, project],
  );

  const effectiveSeam = useMemo(() => {
    if (workspaceMode.kind !== "demo" && workspaceMode.kind !== "local") {
      return seam;
    }

    const simulatedRole = getAuthRole();
    if (simulatedRole === "guest" || !seam.membership) {
      return seam;
    }

    return {
      ...seam,
      membership: {
        ...seam.membership,
        role: simulatedRole,
      },
    };
  }, [seam, workspaceMode.kind]);

  return {
    seam: effectiveSeam,
    can: (action: Action) => seamAllowsAction(effectiveSeam, action),
    role: getProjectRole(effectiveSeam),
    isLoading: isMembersLoading || isProjectLoading,
  };
}
