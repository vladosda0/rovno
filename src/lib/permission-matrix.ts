import type { MemberRole, AIAccess } from "@/types/entities";

export type Action =
  | "ai.generate"
  | "task.create"
  | "task.edit"
  | "estimate.approve"
  | "member.invite"
  | "document.create"
  | "procurement.edit"
  | "hr.edit";

const CONTRACTOR_ACTIONS: Action[] = [
  "ai.generate",
  "task.create",
  "task.edit",
  "document.create",
  "procurement.edit",
  "hr.edit",
];

export function isOwnerOrCoOwner(role: MemberRole): role is "owner" | "co_owner" {
  return role === "owner" || role === "co_owner";
}

/** Coarse action matrix; callers should pass authority from workspace membership (see permissions seam). */
export function can(role: MemberRole, action: Action, aiAccess?: AIAccess): boolean {
  if (isOwnerOrCoOwner(role)) return true;
  if (role === "viewer") return false;
  // contractor
  if (action === "ai.generate") return aiAccess !== "none";
  return CONTRACTOR_ACTIONS.includes(action);
}
