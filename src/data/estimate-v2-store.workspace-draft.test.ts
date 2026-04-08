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

  it("hydrates multi-stage multi-work multi-line graph with pricing fields intact", async () => {
    const projectId = "project-remote-1";
    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-1",
        project_id: projectId,
        title: "Multi-stage Estimate",
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
          title: "Stage 1",
          description: "",
          sort_order: 1,
          status: "open",
          discount_bps: 150,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
        {
          id: "stage-2",
          project_id: projectId,
          title: "Stage 2",
          description: "",
          sort_order: 2,
          status: "open",
          discount_bps: 300,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "work-1",
          estimate_version_id: "version-1",
          project_stage_id: "stage-1",
          title: "Work 1.1",
          description: null,
          sort_order: 1,
          planned_cost_cents: 30000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "work-2",
          estimate_version_id: "version-1",
          project_stage_id: "stage-1",
          title: "Work 1.2",
          description: null,
          sort_order: 2,
          planned_cost_cents: 15000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "work-3",
          estimate_version_id: "version-1",
          project_stage_id: "stage-2",
          title: "Work 2.1",
          description: null,
          sort_order: 1,
          planned_cost_cents: 20000,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      lines: [
        {
          id: "line-1",
          estimate_work_id: "work-1",
          resource_type: "labor",
          title: "Crew A",
          quantity: 2,
          unit: "day",
          unit_price_cents: 15000,
          total_price_cents: 30000,
          client_unit_price_cents: 15750,
          client_total_price_cents: 31500,
          markup_bps: 500,
          discount_bps_override: 200,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "line-2",
          estimate_work_id: "work-2",
          resource_type: "material",
          title: "Lumber",
          quantity: 100,
          unit: "m3",
          unit_price_cents: 150,
          total_price_cents: 15000,
          client_unit_price_cents: 165,
          client_total_price_cents: 16500,
          markup_bps: 1000,
          discount_bps_override: null,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "line-3",
          estimate_work_id: "work-3",
          resource_type: "subcontractor",
          title: "Electrical",
          quantity: 1,
          unit: "job",
          unit_price_cents: 20000,
          total_price_cents: 20000,
          client_unit_price_cents: 21400,
          client_total_price_cents: 21400,
          markup_bps: 700,
          discount_bps_override: 350,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      dependencies: [],
    });

    registerEstimateV2ProjectAccessContext(projectId, {
      mode: "supabase",
      profileId: "profile-1",
      projectOwnerProfileId: "profile-1",
      membershipRole: "owner",
      financeVisibility: "detail",
    });

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
    const state = getEstimateV2ProjectState(projectId);

    expect(state.stages).toHaveLength(2);
    expect(state.stages[0]?.title).toBe("Stage 1");
    expect(state.stages[0]?.discountBps).toBe(150);
    expect(state.stages[1]?.title).toBe("Stage 2");
    expect(state.stages[1]?.discountBps).toBe(300);

    expect(state.works).toHaveLength(3);
    expect(state.works.map((w) => w.title)).toEqual(["Work 1.1", "Work 2.1", "Work 1.2"]);

    expect(state.lines).toHaveLength(3);

    const line1 = state.lines.find((l) => l.title === "Crew A");
    expect(line1).toBeDefined();
    expect(line1?.markupBps).toBe(500);
    expect(line1?.discountBpsOverride).toBe(200);
    expect(line1?.workId).toBe("work-1");

    const line2 = state.lines.find((l) => l.title === "Lumber");
    expect(line2).toBeDefined();
    expect(line2?.markupBps).toBe(1000);
    expect(line2?.discountBpsOverride).toBeNull();
    expect(line2?.workId).toBe("work-2");

    const line3 = state.lines.find((l) => l.title === "Electrical");
    expect(line3).toBeDefined();
    expect(line3?.markupBps).toBe(700);
    expect(line3?.discountBpsOverride).toBe(350);
    expect(line3?.workId).toBe("work-3");
    expect(line3?.stageId).toBe("stage-2");
  });

  it("treats an approved remote estimate root as in_work without requiring downstream bootstrap rows", async () => {
    const projectId = "project-remote-approved-root";

    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-approved",
        project_id: projectId,
        title: "Approved Remote Estimate",
        description: null,
        status: "approved",
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-approved",
        estimate_id: "estimate-approved",
        version_number: 1,
        is_current: true,
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      stages: [],
      works: [],
      lines: [],
      dependencies: [],
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([]),
    });

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });

    const state = getEstimateV2ProjectState(projectId);
    expect(state.project.estimateStatus).toBe("in_work");
    expect(state.works).toEqual([]);
    expect(state.lines).toEqual([]);
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

  it("does not collapse unresolved checklist-derived lines into labor during task-based hydration", async () => {
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
      stages: [],
      works: [],
      lines: [],
      dependencies: [],
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          project_id: projectId,
          stage_id: "stage-1",
          title: "Checklist task",
          description: "",
          status: "todo",
          assignee_id: "",
          checklist: [
            {
              id: "checklist-1",
              text: "Imported row",
              done: false,
              type: "work",
              estimateV2LineId: "line-unknown",
              estimateV2WorkId: "work-unknown",
              estimateV2QtyMilli: 1000,
              estimateV2Unit: "pcs",
            },
          ],
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

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });

    expect(getEstimateV2ProjectState(projectId).lines).toEqual([]);
  });

  it("rebuilds non-sensitive work structure without recreating checklist-derived pseudo-lines for non-detail viewers", async () => {
    const projectId = "project-remote-summary-1";

    registerEstimateV2ProjectAccessContext(projectId, {
      mode: "supabase",
      profileId: "profile-2",
      projectOwnerProfileId: "profile-owner",
      membershipRole: "contractor",
      financeVisibility: "summary",
    });

    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-1",
        project_id: projectId,
        title: "Remote Estimate",
        description: null,
        status: "draft",
        created_by: "profile-owner",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-1",
        estimate_id: "estimate-1",
        version_number: 1,
        is_current: true,
        created_by: "profile-owner",
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
      works: [],
      lines: [],
      dependencies: [],
    });
    getPlanningSourceMock.mockResolvedValue({
      getProjectTasks: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          project_id: projectId,
          stage_id: "stage-1",
          title: "Checklist task",
          description: "",
          status: "todo",
          assignee_id: "",
          checklist: [
            {
              id: "checklist-1",
              text: "Imported row",
              done: false,
              type: "work",
              estimateV2LineId: "line-1",
              estimateV2WorkId: "work-1",
              estimateV2QtyMilli: 4_000,
              estimateV2Unit: "pcs",
            },
          ],
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

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-2" });

    const state = getEstimateV2ProjectState(projectId);
    expect(state.stages).toEqual([
      expect.objectContaining({
        id: "stage-1",
        title: "Shell",
      }),
    ]);
    expect(state.works).toEqual([
      expect.objectContaining({
        id: "work-1",
        stageId: "stage-1",
        title: "Checklist task",
      }),
    ]);
    expect(state.lines).toEqual([]);
  });

  it("rebuilds missing work containers so reduced-access viewers can still render remote lines", async () => {
    const projectId = "project-remote-summary-2";

    registerEstimateV2ProjectAccessContext(projectId, {
      mode: "supabase",
      profileId: "profile-2",
      projectOwnerProfileId: "profile-owner",
      membershipRole: "contractor",
      financeVisibility: "summary",
    });

    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-2",
        project_id: projectId,
        title: "Remote Estimate",
        description: null,
        status: "draft",
        created_by: "profile-owner",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-2",
        estimate_id: "estimate-2",
        version_number: 1,
        is_current: true,
        created_by: "profile-owner",
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
      works: [],
      lines: [
        {
          id: "line-1",
          estimate_work_id: "work-1",
          resource_type: "material",
          title: "Remote line",
          quantity: 3,
          unit: "pcs",
          unit_price_cents: 12500,
          total_price_cents: 37500,
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
          title: "Checklist task",
          description: "",
          status: "todo",
          assignee_id: "",
          checklist: [
            {
              id: "checklist-1",
              text: "Imported row",
              done: false,
              type: "material",
              estimateV2LineId: "line-1",
              estimateV2WorkId: "work-1",
              estimateV2QtyMilli: 3_000,
              estimateV2Unit: "pcs",
            },
          ],
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

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-2" });

    const state = getEstimateV2ProjectState(projectId);
    expect(state.works).toEqual([
      expect.objectContaining({
        id: "work-1",
        stageId: "stage-1",
        title: "Checklist task",
      }),
    ]);
    expect(state.lines).toEqual([
      expect.objectContaining({
        id: "line-1",
        workId: "work-1",
        title: "Remote line",
        qtyMilli: 3_000,
      }),
    ]);
  });

  it("clears stale estimate runtime state when the active supabase profile changes", async () => {
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
          discount_bps: 0,
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
      ],
      lines: [
        {
          id: "line-1",
          estimate_work_id: "work-1",
          resource_type: "equipment",
          title: "Laser level",
          quantity: 1,
          unit: "day",
          unit_price_cents: 3200,
          total_price_cents: 3200,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      dependencies: [],
    });

    await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId: "profile-1" });
    expect(getEstimateV2ProjectState(projectId).lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "line-1",
          type: "tool",
          title: "Laser level",
        }),
      ]),
    );

    registerEstimateV2ProjectAccessContext(projectId, {
      mode: "supabase",
      profileId: "profile-1",
      projectOwnerProfileId: "profile-1",
      membershipRole: "owner",
    });
    registerEstimateV2ProjectAccessContext(projectId, {
      mode: "supabase",
      profileId: "profile-2",
      projectOwnerProfileId: "profile-2",
      membershipRole: "owner",
    });

    expect(getEstimateV2ProjectState(projectId).lines).toEqual([]);
  });

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
