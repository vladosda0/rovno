import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadCurrentEstimateDraftMock,
  saveCurrentEstimateDraftMock,
  getWorkspaceSourceMock,
  getPlanningSourceMock,
  persistEstimateV2HeroTransitionMock,
  syncProjectTasksFromEstimateMock,
  syncProjectProcurementFromEstimateMock,
  syncProjectHRFromEstimateMock,
} = vi.hoisted(() => ({
  loadCurrentEstimateDraftMock: vi.fn(),
  saveCurrentEstimateDraftMock: vi.fn(),
  getWorkspaceSourceMock: vi.fn(),
  getPlanningSourceMock: vi.fn(),
  persistEstimateV2HeroTransitionMock: vi.fn(),
  syncProjectTasksFromEstimateMock: vi.fn(),
  syncProjectProcurementFromEstimateMock: vi.fn(),
  syncProjectHRFromEstimateMock: vi.fn(),
}));

vi.mock("@/data/estimate-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/estimate-source")>("@/data/estimate-source");
  return {
    ...actual,
    loadCurrentEstimateDraft: loadCurrentEstimateDraftMock,
    saveCurrentEstimateDraft: saveCurrentEstimateDraftMock,
  };
});

vi.mock("@/data/workspace-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/workspace-source")>("@/data/workspace-source");
  return {
    ...actual,
    getWorkspaceSource: getWorkspaceSourceMock,
  };
});

vi.mock("@/data/planning-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/planning-source")>("@/data/planning-source");
  return {
    ...actual,
    getPlanningSource: getPlanningSourceMock,
    syncProjectTasksFromEstimate: syncProjectTasksFromEstimateMock,
  };
});

vi.mock("@/data/procurement-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/procurement-source")>("@/data/procurement-source");
  return {
    ...actual,
    syncProjectProcurementFromEstimate: syncProjectProcurementFromEstimateMock,
  };
});

vi.mock("@/data/estimate-v2-hero-transition", () => ({
  persistEstimateV2HeroTransition: persistEstimateV2HeroTransitionMock,
  EstimateV2HeroTransitionError: class EstimateV2HeroTransitionError extends Error {
    code = "TASK_WRITE_FAILED";
    blocking = false;
  },
}));

vi.mock("@/data/hr-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/hr-source")>("@/data/hr-source");
  return {
    ...actual,
    syncProjectHRFromEstimate: syncProjectHRFromEstimateMock,
  };
});

import {
  __unsafeResetEstimateV2ForTests,
  createWork,
  createStage,
  getEstimateV2ProjectState,
  hydrateEstimateV2ProjectFromWorkspace,
  registerEstimateV2ProjectAccessContext,
  transitionEstimateV2ProjectToInWork,
  updateLine,
} from "@/data/estimate-v2-store";
import { __unsafeResetStoreForTests } from "@/data/store";

describe("estimate-v2 workspace drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    localStorage.clear();
    sessionStorage.clear();

    getWorkspaceSourceMock.mockResolvedValue({
      getProjectById: vi.fn().mockResolvedValue({
        id: "project-remote-1",
        owner_id: "profile-1",
        title: "Remote Project",
        type: "residential",
        project_mode: "contractor",
        automation_level: "assisted",
        current_stage_id: "",
        progress_pct: 0,
      }),
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([]),
    });
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
        taskIdByLocalWorkId: {},
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {},
        hrItemIdByLocalLineId: {},
      },
    });
    syncProjectTasksFromEstimateMock.mockResolvedValue({});
    syncProjectProcurementFromEstimateMock.mockResolvedValue(undefined);
    syncProjectHRFromEstimateMock.mockResolvedValue(undefined);
    saveCurrentEstimateDraftMock.mockResolvedValue(undefined);
    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: null,
      currentVersion: null,
      stages: [],
      works: [],
      lines: [],
      dependencies: [],
    });
  });

  it("allows a supabase owner context to create a stage immediately", () => {
    const projectId = "project-remote-1";
    registerEstimateV2ProjectAccessContext(projectId, {
      mode: "supabase",
      profileId: "profile-1",
      projectOwnerProfileId: "profile-1",
      membershipRole: "owner",
    });

    const created = createStage(projectId, { title: "Shell" });

    expect(created).not.toBeNull();
    expect(created?.title).toBe("Shell");
  });

  it("hydrates the current remote draft and links works back to planning tasks", async () => {
    const projectId = "project-remote-1";
    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-1",
        project_id: projectId,
        title: "Remote Estimate",
        description: null,
        status: "draft",
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-1",
        estimate_id: "estimate-1",
        version_number: 1,
        is_current: true,
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      stages: [
        {
          id: "stage-1",
          project_id: projectId,
          title: "Shell",
          description: "",
          sort_order: 1,
          status: "open",
          discount_bps: 250,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "work-1",
          estimate_version_id: "version-1",
          project_stage_id: "stage-1",
          title: "Framing",
          description: null,
          sort_order: 1,
          planned_cost_cents: 30000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "work-2",
          estimate_version_id: "version-1",
          project_stage_id: "stage-1",
          title: "Roof",
          description: null,
          sort_order: 2,
          planned_cost_cents: 15000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      lines: [
        {
          id: "line-1",
          estimate_work_id: "work-1",
          resource_type: "labor",
          title: "Crew",
          quantity: 2,
          unit: "day",
          unit_price_cents: 15000,
          total_price_cents: 30000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      dependencies: [
        {
          id: "dependency-1",
          estimate_version_id: "version-1",
          from_work_id: "work-1",
          to_work_id: "work-2",
          dependency_type: "finish_to_start",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          project_id: projectId,
          stage_id: "stage-1",
          title: "Framing task",
          description: "",
          status: "in_progress",
          assignee_id: "",
          checklist: [
            {
              id: "checklist-1",
              text: "Crew",
              done: false,
              estimateV2LineId: "line-1",
              estimateV2WorkId: "work-1",
              estimateV2ResourceType: "labor",
              estimateV2QtyMilli: 2000,
              estimateV2Unit: "day",
            },
          ],
          comments: [],
          attachments: [],
          photos: [],
          linked_estimate_item_ids: [],
          created_at: "2026-03-01T00:00:00.000Z",
          startDate: "2026-03-10T00:00:00.000Z",
          deadline: "2026-03-12T00:00:00.000Z",
        },
      ]),
    });

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
    const state = getEstimateV2ProjectState(projectId);

    expect(state.project.title).toBe("Remote Project");
    expect(state.stages).toHaveLength(1);
    expect(state.stages[0]?.discountBps).toBe(250);
    expect(state.works).toHaveLength(2);
    expect(state.works[0]).toMatchObject({
      id: "work-1",
      taskId: "task-1",
      status: "in_progress",
      plannedStart: "2026-03-10T00:00:00.000Z",
      plannedEnd: "2026-03-12T00:00:00.000Z",
    });
    expect(state.lines[0]).toMatchObject({
      id: "line-1",
      workId: "work-1",
      stageId: "stage-1",
      title: "Crew",
    });
    expect(state.dependencies[0]).toMatchObject({
      id: "dependency-1",
      fromWorkId: "work-1",
      toWorkId: "work-2",
    });
  });

  it("syncs a second work for an existing hydrated current version without repeated errors", async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectId = "project-remote-1";

    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-1",
        project_id: projectId,
        title: "Remote Estimate",
        description: null,
        status: "draft",
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-existing",
        estimate_id: "estimate-1",
        version_number: 1,
        is_current: true,
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      stages: [
        {
          id: "stage-1",
          project_id: projectId,
          title: "Shell",
          description: "",
          sort_order: 1,
          status: "open",
          discount_bps: 0,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "work-1",
          estimate_version_id: "version-existing",
          project_stage_id: "stage-1",
          title: "Framing",
          description: null,
          sort_order: 1,
          planned_cost_cents: 30000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      lines: [],
      dependencies: [],
    });

    try {
      await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
      registerEstimateV2ProjectAccessContext(projectId, {
        mode: "supabase",
        profileId: "profile-1",
        projectOwnerProfileId: "profile-1",
        membershipRole: "owner",
      });

      const created = createWork(projectId, { stageId: "stage-1", title: "Roof" });

      expect(created).not.toBeNull();

      await vi.advanceTimersByTimeAsync(350);

      expect(saveCurrentEstimateDraftMock).toHaveBeenCalled();
      expect(saveCurrentEstimateDraftMock).toHaveBeenLastCalledWith(
        projectId,
        expect.objectContaining({
          works: expect.arrayContaining([
            expect.objectContaining({ title: "Framing" }),
            expect.objectContaining({ title: "Roof" }),
          ]),
        }),
        expect.objectContaining({ profileId: "profile-1" }),
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("defers the background draft sync until the hero transition finishes", async () => {
    vi.useFakeTimers();
    const projectId = "project-remote-1";
    let resolvePersist: ((value: unknown) => void) | null = null;

    persistEstimateV2HeroTransitionMock.mockImplementation(() => (
      new Promise((resolve) => {
        resolvePersist = resolve;
      })
    ));

    try {
      await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
      registerEstimateV2ProjectAccessContext(projectId, {
        mode: "supabase",
        profileId: "profile-1",
        projectOwnerProfileId: "profile-1",
        membershipRole: "owner",
      });

      const stage = createStage(projectId, { title: "Shell" });
      expect(stage).not.toBeNull();
      const work = createWork(projectId, { stageId: stage?.id ?? "", title: "Framing" });
      expect(work).not.toBeNull();

      const transitionPromise = transitionEstimateV2ProjectToInWork(projectId, { skipSetup: true });

      await vi.advanceTimersByTimeAsync(350);
      expect(saveCurrentEstimateDraftMock).not.toHaveBeenCalled();

      resolvePersist?.({
        fingerprint: "fingerprint-transition",
        profileId: "profile-1",
        ids: {
          estimateId: "estimate-transition",
          versionId: "version-transition",
          eventId: "event-transition",
          stageIdByLocalStageId: {},
          workIdByLocalWorkId: {},
          lineIdByLocalLineId: {},
          taskIdByLocalWorkId: work
            ? { [work.id]: "task-transition" }
            : {},
          checklistItemIdByLocalLineId: {},
          procurementItemIdByLocalLineId: {},
          hrItemIdByLocalLineId: {},
        },
      });

      await transitionPromise;
      await vi.advanceTimersByTimeAsync(350);

      expect(saveCurrentEstimateDraftMock).toHaveBeenCalledTimes(1);
      expect(syncProjectTasksFromEstimateMock).toHaveBeenCalledTimes(1);
      expect(syncProjectProcurementFromEstimateMock).toHaveBeenCalledTimes(1);
      expect(syncProjectHRFromEstimateMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["viewer", "contractor"] as const)(
    "suppresses remote draft and projection sync for %s estimate access",
    async (membershipRole) => {
      vi.useFakeTimers();
      const projectId = "project-remote-1";

      try {
        await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
        registerEstimateV2ProjectAccessContext(projectId, {
          mode: "supabase",
          profileId: "profile-1",
          projectOwnerProfileId: "profile-owner",
          membershipRole,
        });

        await vi.advanceTimersByTimeAsync(350);

        expect(saveCurrentEstimateDraftMock).not.toHaveBeenCalled();
        expect(syncProjectTasksFromEstimateMock).not.toHaveBeenCalled();
        expect(syncProjectProcurementFromEstimateMock).not.toHaveBeenCalled();
        expect(syncProjectHRFromEstimateMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("skips stale HR projection writes when a newer estimate edit lands mid-sync", async () => {
    vi.useFakeTimers();
    const projectId = "project-remote-1";
    let resolveFirstTaskSync: ((value: Record<string, string>) => void) | null = null;

    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-1",
        project_id: projectId,
        title: "Remote Estimate",
        description: null,
        status: "in_work",
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-existing",
        estimate_id: "estimate-1",
        version_number: 1,
        is_current: true,
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      stages: [
        {
          id: "stage-1",
          project_id: projectId,
          title: "Shell",
          description: "",
          sort_order: 1,
          status: "open",
          discount_bps: 0,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "work-1",
          estimate_version_id: "version-existing",
          project_stage_id: "stage-1",
          title: "Framing",
          description: null,
          sort_order: 1,
          planned_cost_cents: 30000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      lines: [
        {
          id: "line-1",
          estimate_work_id: "work-1",
          resource_type: "labor",
          title: "чел 1",
          quantity: 1,
          unit: "смена",
          unit_price_cents: 100000,
          total_price_cents: 100000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      dependencies: [],
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          project_id: projectId,
          stage_id: "stage-1",
          title: "Framing task",
          description: "",
          status: "in_progress",
          assignee_id: "",
          checklist: [],
          comments: [],
          attachments: [],
          photos: [],
          linked_estimate_item_ids: [],
          created_at: "2026-03-01T00:00:00.000Z",
          startDate: null,
          deadline: null,
        },
      ]),
    });

    syncProjectTasksFromEstimateMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstTaskSync = resolve;
      }))
      .mockResolvedValue({ "work-1": "task-1" });

    try {
      await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
      registerEstimateV2ProjectAccessContext(projectId, {
        mode: "supabase",
        profileId: "profile-1",
        projectOwnerProfileId: "profile-1",
        membershipRole: "owner",
      });

      await vi.advanceTimersByTimeAsync(350);
      expect(syncProjectTasksFromEstimateMock).toHaveBeenCalledTimes(1);

      updateLine(projectId, "line-1", {
        title: "чел 111",
        costUnitCents: 130000,
      });

      resolveFirstTaskSync?.({ "work-1": "task-1" });
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(350);

      expect(syncProjectHRFromEstimateMock).toHaveBeenCalledTimes(1);
      expect(syncProjectHRFromEstimateMock).toHaveBeenCalledWith(
        { kind: "supabase", profileId: "profile-1" },
        expect.objectContaining({
          projectId,
          lines: expect.arrayContaining([
            expect.objectContaining({
              title: "чел 111",
              costUnitCents: 130000,
            }),
          ]),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let stale remote hydration overwrite a newer local line title while sync is in flight", async () => {
    vi.useFakeTimers();
    const projectId = "project-remote-1";
    let resolveFirstTaskSync: ((value: Record<string, string>) => void) | null = null;

    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-1",
        project_id: projectId,
        title: "Remote Estimate",
        description: null,
        status: "in_work",
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-existing",
        estimate_id: "estimate-1",
        version_number: 1,
        is_current: true,
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      stages: [
        {
          id: "stage-1",
          project_id: projectId,
          title: "Shell",
          description: "",
          sort_order: 1,
          status: "open",
          discount_bps: 0,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "work-1",
          estimate_version_id: "version-existing",
          project_stage_id: "stage-1",
          title: "Framing",
          description: null,
          sort_order: 1,
          planned_cost_cents: 30000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      lines: [
        {
          id: "line-1",
          estimate_work_id: "work-1",
          resource_type: "equipment",
          title: "Laser level v1",
          quantity: 1,
          unit: "day",
          unit_price_cents: 3200,
          total_price_cents: 3200,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      dependencies: [],
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          project_id: projectId,
          stage_id: "stage-1",
          title: "Framing task",
          description: "",
          status: "in_progress",
          assignee_id: "",
          checklist: [],
          comments: [],
          attachments: [],
          photos: [],
          linked_estimate_item_ids: [],
          created_at: "2026-03-01T00:00:00.000Z",
          startDate: null,
          deadline: null,
        },
      ]),
    });

    syncProjectTasksFromEstimateMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstTaskSync = resolve;
      }))
      .mockResolvedValue({ "work-1": "task-1" });

    try {
      await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
      registerEstimateV2ProjectAccessContext(projectId, {
        mode: "supabase",
        profileId: "profile-1",
        projectOwnerProfileId: "profile-1",
        membershipRole: "owner",
      });

      await vi.advanceTimersByTimeAsync(350);
      expect(syncProjectTasksFromEstimateMock).toHaveBeenCalledTimes(1);

      updateLine(projectId, "line-1", {
        title: "Laser level v2",
      });

      await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });

      expect(getEstimateV2ProjectState(projectId).lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "line-1",
            title: "Laser level v2",
          }),
        ]),
      );

      resolveFirstTaskSync?.({ "work-1": "task-1" });
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(350);

      expect(syncProjectProcurementFromEstimateMock).toHaveBeenLastCalledWith(expect.objectContaining({
        projectId,
        lines: expect.arrayContaining([
          expect.objectContaining({
            title: "Laser level v2",
            type: "tool",
          }),
        ]),
      }));
      expect(syncProjectHRFromEstimateMock).toHaveBeenLastCalledWith(
        { kind: "supabase", profileId: "profile-1" },
        expect.objectContaining({
          projectId,
          lines: expect.arrayContaining([
            expect.objectContaining({
              title: "Laser level v2",
            }),
          ]),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
