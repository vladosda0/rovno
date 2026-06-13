import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateProjectEstimateExecutionStatusMock } = vi.hoisted(() => ({
  updateProjectEstimateExecutionStatusMock: vi.fn(),
}));

vi.mock("@/data/estimate-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/estimate-source")>("@/data/estimate-source");
  return {
    ...actual,
    updateProjectEstimateExecutionStatus: updateProjectEstimateExecutionStatusMock,
  };
});

import {
  __unsafeResetEstimateV2ForTests,
  clearEstimateV2ProjectAccessContext,
  getEstimateV2ProjectState,
  registerEstimateV2ProjectAccessContext,
  setProjectEstimateStatus,
} from "@/data/estimate-v2-store";
import { __unsafeResetStoreForTests } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

const PROJECT_ID = "project-2";

beforeEach(() => {
  vi.clearAllMocks();
  __unsafeResetStoreForTests();
  __unsafeResetEstimateV2ForTests();
  clearDemoSession();
  enterDemoSession(PROJECT_ID);
  setAuthRole("owner");
  updateProjectEstimateExecutionStatusMock.mockResolvedValue(undefined);
});

afterEach(() => {
  clearEstimateV2ProjectAccessContext(PROJECT_ID);
  clearDemoSession();
  setAuthRole("owner");
});

describe("execution_status portfolio mirror", () => {
  it("mirrors a paused status onto the estimate root in managed supabase sync", () => {
    registerEstimateV2ProjectAccessContext(PROJECT_ID, {
      mode: "supabase",
      profileId: "profile-1",
      projectOwnerProfileId: "profile-1",
      membershipRole: "owner",
    });
    const estimateId = getEstimateV2ProjectState(PROJECT_ID).project.id;

    const result = setProjectEstimateStatus(PROJECT_ID, "paused");

    expect(result.ok).toBe(true);
    expect(updateProjectEstimateExecutionStatusMock).toHaveBeenCalledWith(estimateId, "paused");
  });

  it("does not write to Supabase in demo/local mode (no managed sync context)", () => {
    const result = setProjectEstimateStatus(PROJECT_ID, "paused");

    expect(result.ok).toBe(true);
    expect(updateProjectEstimateExecutionStatusMock).not.toHaveBeenCalled();
  });
});
