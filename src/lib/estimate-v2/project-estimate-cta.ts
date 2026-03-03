import type { Regime } from "@/types/estimate-v2";

export interface ProjectEstimateCtaState {
  showSubmit: boolean;
  showApprove: boolean;
  approveDisabled: boolean;
  approveDisabledReason: string | null;
  showClientPreviewBadge: boolean;
}

interface ResolveProjectEstimateCtaInput {
  regime: Regime;
  isOwner: boolean;
  hasProposedVersion: boolean;
}

export function resolveProjectEstimateCtaState(
  input: ResolveProjectEstimateCtaInput,
): ProjectEstimateCtaState {
  const { regime, isOwner, hasProposedVersion } = input;

  if (regime === "client") {
    return {
      showSubmit: false,
      showApprove: true,
      approveDisabled: !hasProposedVersion,
      approveDisabledReason: hasProposedVersion ? null : "No submitted version to approve",
      showClientPreviewBadge: isOwner,
    };
  }

  return {
    showSubmit: isOwner,
    showApprove: false,
    approveDisabled: true,
    approveDisabledReason: null,
    showClientPreviewBadge: false,
  };
}
