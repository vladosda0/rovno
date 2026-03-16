import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  persistEstimateV2HeroTransitionMock,
  getWorkspaceSourceMock,
  resolveRuntimeWorkspaceModeMock,
  MockEstimateV2HeroTransitionError,
} = vi.hoisted(() => {
  class MockEstimateV2HeroTransitionError extends Error {
    code: string;
    blocking: boolean;

    constructor(code: string, message: string, options?: { blocking?: boolean }) {
      super(message);
      this.name = "EstimateV2HeroTransitionError";
      this.code = code;
      this.blocking = options?.blocking ?? false;
    }
  }

  return {
    persistEstimateV2HeroTransitionMock: vi.fn(),
    getWorkspaceSourceMock: vi.fn(),
    resolveRuntimeWorkspaceModeMock: vi.fn(),
    MockEstimateV2HeroTransitionError,
  };
});

vi.mock("@/data/estimate-v2-hero-transition", () => ({
  persistEstimateV2HeroTransition: persistEstimateV2HeroTransitionMock,
  EstimateV2HeroTransitionError: MockEstimateV2HeroTransitionError,
}));

vi.mock("@/data/workspace-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/workspace-source")>("@/data/workspace-source");
  return {
    ...actual,
    getWorkspaceSource: getWorkspaceSourceMock,
    resolveRuntimeWorkspaceMode: resolveRuntimeWorkspaceModeMock,
  };
});

import {
  __unsafeResetEstimateV2ForTests,
  getEstimateV2ProjectState,
  setProjectEstimateStatus,
  transitionEstimateV2ProjectToInWork,
} from "@/data/estimate-v2-store";
import { __unsafeResetStoreForTests, getTasks } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

beforeEach(() => {
  vi.clearAllMocks();
  __unsafeResetStoreForTests();
  __unsafeResetEstimateV2ForTests();
  clearDemoSession();
  enterDemoSession("project-2");
  setAuthRole("owner");

  resolveRuntimeWorkspaceModeMock.mockResolvedValue({
    kind: "supabase",
    profileId: "profile-1",
  });
  getWorkspaceSourceMock.mockResolvedValue({
    getProjectById: vi.fn().mockResolvedValue({
      id: "project-2",
      owner_id: "profile-1",
      title: "Project 2",
      type: "repair",
      automation_level: "manual",
      current_stage_id: "",
      progress_pct: 0,
    }),
  });
});

afterEach(() => {
  clearDemoSession();
  setAuthRole("owner");
});

describe("estimate-v2 remote hero transition", () => {
  it("keeps local estimate state unchanged when the remote transition fails", async () => {
    const projectId = "project-2";
    const before = getEstimateV2ProjectState(projectId);
    const taskCountBefore = getTasks(projectId).length;

    persistEstimateV2HeroTransitionMock.mockRejectedValue(
      new MockEstimateV2HeroTransitionError(
        "ACTIVITY_WRITE_FAILED",
        "The transition did not complete and must be retried.",
      ),
    );

    const result = await transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });
    const after = getEstimateV2ProjectState(projectId);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("transition_failed");
    expect(after.project.estimateStatus).toBe(before.project.estimateStatus);
    expect(after.scheduleBaseline).toBeNull();
    expect(after.works.map((work) => work.taskId)).toEqual(before.works.map((work) => work.taskId));
    expect(getTasks(projectId).length).toBe(taskCountBefore);
  });

  it("keeps missing work dates as the only intentional transition blocker before skip setup", async () => {
    const projectId = "project-2";

    const result = await transitionEstimateV2ProjectToInWork(projectId);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_work_dates");
    expect((result.missingWorkIds ?? []).length).toBeGreaterThan(0);
    expect(persistEstimateV2HeroTransitionMock).not.toHaveBeenCalled();
  });

  it("applies only estimate-v2 local success state after remote persistence succeeds", async () => {
    const projectId = "project-2";
    const before = getEstimateV2ProjectState(projectId);
    const taskCountBefore = getTasks(projectId).length;
    const taskIdByLocalWorkId = Object.fromEntries(
      before.works.map((work, index) => [work.id, `task-remote-${index}`]),
    );

    persistEstimateV2HeroTransitionMock.mockResolvedValue({
      fingerprint: "fingerprint-1",
      profileId: "profile-1",
      ids: {
        estimateId: "estimate-1",
        versionId: "version-1",
        eventId: "event-1",
        stageIdByLocalStageId: {},
        workIdByLocalWorkId: {},
        lineIdByLocalLineId: {},
        taskIdByLocalWorkId,
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {},
        hrItemIdByLocalLineId: {},
      },
    });

    const result = await transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });
    const after = getEstimateV2ProjectState(projectId);

    expect(result.ok).toBe(true);
    expect(result.autoScheduled).toBe(true);
    expect(result.baselineCaptured).toBe(true);
    expect(after.project.estimateStatus).toBe("in_work");
    expect(after.scheduleBaseline).not.toBeNull();
    expect(after.works.every((work) => Boolean(work.plannedStart) && Boolean(work.plannedEnd))).toBe(true);
    expect(after.works.map((work) => work.taskId)).toEqual(
      before.works.map((work) => taskIdByLocalWorkId[work.id]),
    );
    expect(getTasks(projectId).length).toBe(taskCountBefore);
  });

  it("uses the provided owner profile id instead of falling back to guest runtime auth", async () => {
    const projectId = "project-2";
    const before = getEstimateV2ProjectState(projectId);
    const taskIdByLocalWorkId = Object.fromEntries(
      before.works.map((work, index) => [work.id, `task-remote-owner-${index}`]),
    );

    resolveRuntimeWorkspaceModeMock.mockResolvedValue({
      kind: "guest",
    });
    persistEstimateV2HeroTransitionMock.mockResolvedValue({
      fingerprint: "fingerprint-owner-1",
      profileId: "profile-1",
      ids: {
        estimateId: "estimate-owner-1",
        versionId: "version-owner-1",
        eventId: "event-owner-1",
        stageIdByLocalStageId: {},
        workIdByLocalWorkId: {},
        lineIdByLocalLineId: {},
        taskIdByLocalWorkId,
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {},
        hrItemIdByLocalLineId: {},
      },
    });

    const result = await transitionEstimateV2ProjectToInWork(projectId, {
      skipSetup: true,
      ownerProfileId: "profile-1",
    });

    expect(result.ok).toBe(true);
    expect(persistEstimateV2HeroTransitionMock).toHaveBeenCalledOnce();
  });

  it("does not call the remote hero transition path while runtime workspace stays in demo mode", async () => {
    const projectId = "project-2";
    resolveRuntimeWorkspaceModeMock.mockResolvedValue({
      kind: "demo",
    });

    const result = await transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("forbidden");
    expect(persistEstimateV2HeroTransitionMock).not.toHaveBeenCalled();
  });

  it("still runs the remote activation path on paused -> in_work when tasks were never materialized", async () => {
    const projectId = "project-2";
    const paused = setProjectEstimateStatus(projectId, "paused");
    expect(paused.ok).toBe(true);

    const before = getEstimateV2ProjectState(projectId);
    const taskIdByLocalWorkId = Object.fromEntries(
      before.works.map((work, index) => [work.id, `task-remote-paused-${index}`]),
    );

    persistEstimateV2HeroTransitionMock.mockResolvedValue({
      fingerprint: "fingerprint-paused-1",
      profileId: "profile-1",
      ids: {
        estimateId: "estimate-paused-1",
        versionId: "version-paused-1",
        eventId: "event-paused-1",
        stageIdByLocalStageId: {},
        workIdByLocalWorkId: {},
        lineIdByLocalLineId: {},
        taskIdByLocalWorkId,
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {},
        hrItemIdByLocalLineId: {},
      },
    });

    const result = await transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });
    const after = getEstimateV2ProjectState(projectId);

    expect(result.ok).toBe(true);
    expect(after.project.estimateStatus).toBe("in_work");
    expect(after.scheduleBaseline).not.toBeNull();
    expect(after.works.map((work) => work.taskId)).toEqual(
      before.works.map((work) => taskIdByLocalWorkId[work.id]),
    );
    expect(persistEstimateV2HeroTransitionMock).toHaveBeenCalledOnce();
  });

  it("still runs the remote reconciliation path when tasks already exist from a prior local materialization", async () => {
    const projectId = "project-2";
    const activated = setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    expect(activated.ok).toBe(true);
    const paused = setProjectEstimateStatus(projectId, "paused");
    expect(paused.ok).toBe(true);

    const before = getEstimateV2ProjectState(projectId);
    expect(before.works.every((work) => Boolean(work.taskId))).toBe(true);

    const taskIdByLocalWorkId = Object.fromEntries(
      before.works.map((work) => [work.id, work.taskId ?? `task-existing-${work.id}`]),
    );

    persistEstimateV2HeroTransitionMock.mockResolvedValue({
      fingerprint: "fingerprint-existing-tasks",
      profileId: "profile-1",
      ids: {
        estimateId: "estimate-existing-tasks",
        versionId: "version-existing-tasks",
        eventId: "event-existing-tasks",
        stageIdByLocalStageId: {},
        workIdByLocalWorkId: {},
        lineIdByLocalLineId: {},
        taskIdByLocalWorkId,
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {},
        hrItemIdByLocalLineId: {},
      },
    });

    const result = await transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });

    expect(result.ok).toBe(true);
    expect(persistEstimateV2HeroTransitionMock).toHaveBeenCalledOnce();
  });

  it("downgrades old blocking hero-transition errors to a retryable transition failure", async () => {
    const projectId = "project-2";

    persistEstimateV2HeroTransitionMock.mockRejectedValue(
      new MockEstimateV2HeroTransitionError(
        "UNSAFE_REMOTE_ROWS",
        "Estimate changed after a partial remote transition. Reload the page before trying again.",
        { blocking: true },
      ),
    );

    const result = await transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("transition_failed");
    expect(result.blocking).toBe(false);
  });
});
