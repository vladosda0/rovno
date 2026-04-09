import type { ProjectMode } from "@/types/estimate-v2";

export interface ProjectEstimateCtaState {
  showSubmit: boolean;
  showApprove: boolean;
  approveDisabled: boolean;
  approveDisabledReason: string | null;
  showClientPreviewBadge: boolean;
}

interface ResolveProjectEstimateCtaInput {
  projectMode: ProjectMode;
  isOwner: boolean;
  hasProposedVersion: boolean;
}

export function resolveProjectEstimateCtaState(
  input: ResolveProjectEstimateCtaInput,
): ProjectEstimateCtaState {
  return {
    showSubmit: input.isOwner && input.projectMode === "contractor",
    showApprove: false,
    approveDisabled: true,
    approveDisabledReason: null,
    showClientPreviewBadge: false,
  };
}
