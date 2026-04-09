import { describe, expect, it } from "vitest";
import { resolveProjectEstimateCtaState } from "@/lib/estimate-v2/project-estimate-cta";

describe("resolveProjectEstimateCtaState", () => {
  it("owner + contractor shows submit and hides approve", () => {
    const state = resolveProjectEstimateCtaState({
      projectMode: "contractor",
      isOwner: true,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(true);
    expect(state.showApprove).toBe(false);
  });

  it("owner + build_myself shows submit and hides approve", () => {
    const state = resolveProjectEstimateCtaState({
      projectMode: "build_myself",
      isOwner: true,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(false);
    expect(state.showApprove).toBe(false);
  });

  it("non-owner hides submit", () => {
    const state = resolveProjectEstimateCtaState({
      projectMode: "contractor",
      isOwner: false,
      hasProposedVersion: true,
    });
    expect(state.showSubmit).toBe(false);
    expect(state.showApprove).toBe(false);
  });
});
