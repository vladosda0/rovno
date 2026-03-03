import { describe, expect, it } from "vitest";
import { resolveProjectEstimateCtaState } from "@/lib/estimate-v2/project-estimate-cta";

describe("resolveProjectEstimateCtaState", () => {
  it("owner + contractor shows submit and hides approve", () => {
    const state = resolveProjectEstimateCtaState({
      regime: "contractor",
      isOwner: true,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(true);
    expect(state.showApprove).toBe(false);
  });

  it("owner + build_myself shows submit and hides approve", () => {
    const state = resolveProjectEstimateCtaState({
      regime: "build_myself",
      isOwner: true,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(true);
    expect(state.showApprove).toBe(false);
  });

  it("owner + client shows approve, hides submit, and marks client preview", () => {
    const state = resolveProjectEstimateCtaState({
      regime: "client",
      isOwner: true,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(false);
    expect(state.showApprove).toBe(true);
    expect(state.showClientPreviewBadge).toBe(true);
    expect(state.approveDisabled).toBe(false);
  });

  it("non-owner + client shows approve, hides submit", () => {
    const state = resolveProjectEstimateCtaState({
      regime: "client",
      isOwner: false,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(false);
    expect(state.showApprove).toBe(true);
    expect(state.showClientPreviewBadge).toBe(false);
  });

  it("client regime without proposed version keeps approve visible but disabled", () => {
    const state = resolveProjectEstimateCtaState({
      regime: "client",
      isOwner: false,
      hasProposedVersion: false,
    });
    expect(state.showApprove).toBe(true);
    expect(state.approveDisabled).toBe(true);
    expect(state.approveDisabledReason).toBe("No submitted version to approve");
  });
});
