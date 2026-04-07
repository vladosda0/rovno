import type { Member, Project } from "@/types/entities";

/**
 * Canonical read model for project-scoped authority in the app shell.
 *
 * Contract surface: docs/permissions.contract.json
 * Discovery index: src/lib/permissions-contract-surfaces.ts
 *
 * Sourced from workspace membership + project rows (Supabase queries or demo/local store).
 * Add fields only when they appear on generated `backend-truth` shapes consumed by mappers.
 *
 * Contract drift note: `internal_docs_visibility` exists in backend SQL and RPCs but is not yet
 * present on `project_members.Row` in `backend-truth/generated/supabase-types.ts`. Do not add it
 * to this seam until the generated mirror is regenerated from `rovno-db`.
 */
export interface ProjectAuthoritySeam {
  projectId: string;
  /** Current workspace profile id (`Member.user_id` / `profiles.id`). */
  profileId: string;
  /** Membership row for `profileId`, or null if not in the project. */
  membership: Member | null;
  project: Project | undefined;
}

export function buildProjectAuthoritySeam(input: {
  projectId: string;
  profileId: string;
  members: Member[];
  project: Project | undefined;
}): ProjectAuthoritySeam {
  const membership = input.members.find((m) => m.user_id === input.profileId) ?? null;
  return {
    projectId: input.projectId,
    profileId: input.profileId,
    membership,
    project: input.project,
  };
}
