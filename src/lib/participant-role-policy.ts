import type { AIAccess, MemberRole } from "@/types/entities";

export const MEMBER_INVITE_ROLES: readonly MemberRole[] = ["co_owner", "contractor", "viewer"];

const INVITE_ROLE_OPTIONS_BY_ACTOR: Record<MemberRole, MemberRole[]> = {
  owner: ["co_owner", "contractor", "viewer"],
  co_owner: ["contractor", "viewer"],
  contractor: [],
  viewer: [],
};

/**
 * Role options for sending a new project invitation.
 *
 * Backend contract enforcement:
 * - Only `owner` may assign/promote `co_owner`.
 * - `co_owner` may only assign/promote `contractor` or `viewer`.
 */
export function getInviteRoleOptions(actorRole: MemberRole): MemberRole[] {
  return INVITE_ROLE_OPTIONS_BY_ACTOR[actorRole];
}

/**
 * Role options for changing an existing member/pending-invite role.
 *
 * UI is conservative and never attempts to assign `owner` through this pathway.
 */
export function getReassignRoleOptions(
  actorRole: MemberRole,
  targetCurrentRole: MemberRole,
): MemberRole[] {
  if (targetCurrentRole === "owner") return [];

  if (actorRole === "owner") return ["co_owner", "contractor", "viewer"];
  if (actorRole === "co_owner") return ["contractor", "viewer"];
  return [];
}

const AI_ACCESS_RANK: readonly AIAccess[] = ["none", "consult_only", "project_pool"];

/**
 * AI access options for an invitation payload, constrained by what the actor already holds.
 *
 * This is a client-side pre-filter (backend remains authoritative) to avoid
 * offering “grant more than you have” options in the UI.
 */
export function getInviteAiAccessOptions(actorAiAccess: AIAccess): AIAccess[] {
  const maxIndex = AI_ACCESS_RANK.indexOf(actorAiAccess);
  if (maxIndex < 0) return ["none"];
  return AI_ACCESS_RANK.slice(0, maxIndex + 1);
}

