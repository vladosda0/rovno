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
