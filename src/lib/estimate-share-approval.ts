import { isEditorSeatRole } from "@/components/participants/participants-shared";
import { getTierLimits } from "@/data/tier-limits";
import type { MemberRole, UserPlan } from "@/types/entities";

// rovno#138 (decision 2026-09-29): a client may approve through a share link
// while the owner has a free editor seat, counted like the Participants screen:
// editors_per_project of the owner's live plan against co_owner and contractor
// rows. While the owner's plan is unknown, approval stays disabled.

export interface ShareApprovalPolicy {
  shareApprovalPolicy: "disabled" | "registered";
  shareApprovalDisabledReason?: "no_participant_slot";
}

// Demo seed plans (free|pro|business) onto billing tier codes, as on the Participants screen.
const LEGACY_PLAN_TIER: Record<UserPlan, string> = {
  free: "free",
  pro: "master",
  business: "brigade",
};

export interface OwnerPlanInput {
  workspaceKind: string;
  /** Only the owner can read the owner's subscription (RLS). */
  viewerIsOwner: boolean;
  authenticated: boolean;
  subscription: { isLoading: boolean; isError: boolean; planCode: string | null | undefined };
  demoOwnerPlan: UserPlan;
  membersLoading: boolean;
  /** An owner row is in the members list; without one the list is not loaded. */
  ownerRowLoaded: boolean;
}

export function resolveOwnerPlanCode(input: OwnerPlanInput): string | null {
  if (input.membersLoading) return null;
  if (input.workspaceKind === "demo") return LEGACY_PLAN_TIER[input.demoOwnerPlan];
  if (input.workspaceKind !== "supabase" || !input.viewerIsOwner || !input.authenticated) return null;
  if (!input.ownerRowLoaded) return null;
  if (input.subscription.isLoading || input.subscription.isError) return null;
  return input.subscription.planCode ?? "free";
}

export interface ShareApprovalInput {
  ownerPlanCode: string | null;
  members: ReadonlyArray<{ role: MemberRole }>;
}

export function resolveShareApprovalPolicy(input: ShareApprovalInput): ShareApprovalPolicy {
  const disabled: ShareApprovalPolicy = { shareApprovalPolicy: "disabled", shareApprovalDisabledReason: "no_participant_slot" };
  if (!input.ownerPlanCode) return disabled;
  const limit = getTierLimits(input.ownerPlanCode)?.editors_per_project;
  if (limit === undefined) return disabled;
  if (limit < 0) return { shareApprovalPolicy: "registered" };
  const used = input.members.filter((member) => isEditorSeatRole(member.role)).length;
  return used < limit ? { shareApprovalPolicy: "registered" } : disabled;
}
