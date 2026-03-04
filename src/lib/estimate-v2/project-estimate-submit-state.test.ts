import { describe, expect, it } from "vitest";
import { resolveSubmitToClientState } from "@/lib/estimate-v2/project-estimate-submit-state";

describe("resolveSubmitToClientState", () => {
  it("keeps submit enabled when there is no pending submitted version", () => {
    const state = resolveSubmitToClientState({
      hasPendingSubmittedVersion: false,
      hasChangesSincePendingSubmission: false,
    });
    expect(state.submitDisabled).toBe(false);
    expect(state.submitDisabledReason).toBeNull();
  });

  it("disables submit when pending version has no new changes", () => {
    const state = resolveSubmitToClientState({
      hasPendingSubmittedVersion: true,
      hasChangesSincePendingSubmission: false,
    });
    expect(state.submitDisabled).toBe(true);
    expect(state.submitDisabledReason).toBe("No changes since last submission");
  });

  it("enables submit when pending version has changes", () => {
    const state = resolveSubmitToClientState({
      hasPendingSubmittedVersion: true,
      hasChangesSincePendingSubmission: true,
    });
    expect(state.submitDisabled).toBe(false);
    expect(state.submitDisabledReason).toBeNull();
  });
});
