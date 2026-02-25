import type { MemberRole, AIAccess } from "@/types/entities";
import { getMembers, getCurrentUser } from "@/data/store";

export type Action =
  | "ai.generate"
  | "task.create"
  | "task.edit"
  | "estimate.approve"
  | "member.invite"
  | "document.create"
  | "procurement.edit";

const CONTRACTOR_ACTIONS: Action[] = [
  "ai.generate", "task.create", "task.edit", "document.create", "procurement.edit",
];

export function isOwnerOrCoOwner(role: MemberRole): role is "owner" | "co_owner" {
  return role === "owner" || role === "co_owner";
}

export function can(role: MemberRole, action: Action, aiAccess?: AIAccess): boolean {
  if (isOwnerOrCoOwner(role)) return true;
  if (role === "viewer") return false;
  // contractor
  if (action === "ai.generate") return aiAccess !== "none";
  return CONTRACTOR_ACTIONS.includes(action);
}

export function usePermission(projectId: string) {
  const user = getCurrentUser();
  const members = getMembers(projectId);
  const membership = members.find((m) => m.user_id === user.id);
  const role: MemberRole = membership?.role ?? "viewer";
  const aiAccess: AIAccess = membership?.ai_access ?? "none";

  return {
    role,
    can: (action: Action) => can(role, action, aiAccess),
  };
}
