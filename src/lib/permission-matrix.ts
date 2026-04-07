import type { MemberRole, AIAccess } from "@/types/entities";

/**
 * Legacy coarse action keys. For domain-specific action states (hidden / disabled_visible / enabled)
 * prefer `resolveActionState` from `permission-contract-actions.ts`.
 *
 * Contract-aligned narrowing (Track 3):
 * - `procurement.edit` and `hr.edit` removed: the contract does not grant these to contractor preset.
 *   Procurement actions use `resolveActionState("procurement", ...)` which returns `disabled_visible`.
 *   HR domain is `hidden` for contractor/viewer; gating uses domain access, not this matrix.
 */
export type Action =
  | "ai.generate"
  | "task.create"
  | "task.edit"
  | "estimate.approve"
  | "member.invite"
  | "document.create";

const CONTRACTOR_ACTIONS: Action[] = [
  "ai.generate",
  "task.create",
  "task.edit",
  "document.create",
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
