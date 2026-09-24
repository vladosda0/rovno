// rovno-db#86 (decision 2026-09-24): the Free estimate cap is charged to the
// PROJECT OWNER. One project holds one estimate; the owner's single Free estimate
// is spent on their own project, and an invited member working on the estimate in
// someone else's project spends nothing and never sees the upgrade paywall there.
//
// The answer comes from can_start_project_estimate(project), which is the
// backend trigger's own decision for this project (including "yes" when the
// project already has its estimate root). "No" is the paywall for the owner and
// a neutral notice for anyone else. While the answer is unknown the user is let
// through; enforce_estimate_count_limit still refuses on the server.

export type EstimateStartGate = "allow" | "paywall" | "owner_limit";

export interface EstimateStartGateInput {
  isProjectOwner: boolean;
  canStartInProject: boolean | null | undefined;
}

export function resolveEstimateStartGate(input: EstimateStartGateInput): EstimateStartGate {
  if (input.canStartInProject !== false) {
    return "allow";
  }
  return input.isProjectOwner ? "paywall" : "owner_limit";
}
