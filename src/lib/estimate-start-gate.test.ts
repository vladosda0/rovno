import { describe, expect, it } from "vitest";
import { resolveEstimateStartGate } from "@/lib/estimate-start-gate";

// rovno-db#86: the Free estimate cap is charged to the PROJECT OWNER, and
// can_start_project_estimate is the server's own answer for this project (it also
// says yes when the project already has its estimate root). The owner sees the
// paywall on "no"; an invited member never does and gets a neutral notice.

describe("resolveEstimateStartGate", () => {
  it("owner whose limit is spent gets the paywall", () => {
    expect(resolveEstimateStartGate({ isProjectOwner: true, canStartInProject: false })).toBe("paywall");
  });

  it("owner at the cap still starts when the server says yes (the project already has its root)", () => {
    expect(resolveEstimateStartGate({ isProjectOwner: true, canStartInProject: true })).toBe("allow");
  });

  it("a member in a project whose owner's limit is spent sees the neutral notice, never the paywall", () => {
    expect(resolveEstimateStartGate({ isProjectOwner: false, canStartInProject: false })).toBe("owner_limit");
  });

  it("a member starts whenever the server says yes, whatever their own quota", () => {
    expect(resolveEstimateStartGate({ isProjectOwner: false, canStartInProject: true })).toBe("allow");
  });

  it("while the answer is unknown, anyone is let through (the backend trigger still enforces)", () => {
    expect(resolveEstimateStartGate({ isProjectOwner: true, canStartInProject: undefined })).toBe("allow");
    expect(resolveEstimateStartGate({ isProjectOwner: false, canStartInProject: null })).toBe("allow");
  });
});
