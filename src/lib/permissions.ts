import { useMemo } from "react";
import {
  useWorkspaceCurrentUser,
  useWorkspaceProject,
  useWorkspaceProjectMembers,
} from "@/hooks/use-workspace-source";
import { can, type Action } from "@/lib/permission-matrix";
import {
  buildProjectAuthoritySeam,
  type ProjectAuthoritySeam,
} from "@/lib/project-authority-seam";

export type { Action } from "@/lib/permission-matrix";
export { can, isOwnerOrCoOwner } from "@/lib/permission-matrix";
export type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
export { buildProjectAuthoritySeam } from "@/lib/project-authority-seam";

/** UI and non-React callers (e.g. AI commit) should use this instead of re-lookup in the demo store alone. */
export function seamAllowsAction(seam: ProjectAuthoritySeam, action: Action): boolean {
  const role = seam.membership?.role ?? "viewer";
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
  const members = useWorkspaceProjectMembers(projectId);
  const project = useWorkspaceProject(projectId);

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

  return {
    seam,
    can: (action: Action) => seamAllowsAction(seam, action),
    role: seam.membership?.role ?? "viewer",
  };
}
