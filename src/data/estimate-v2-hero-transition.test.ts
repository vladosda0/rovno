import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveRuntimeWorkspaceModeMock,
  getLatestHeroTransitionEventMock,
  insertHeroTransitionEventMock,
  ensureProjectEstimateRootMock,
  ensureEstimateCurrentVersionMock,
  loadCurrentEstimateDraftMock,
  upsertEstimateWorksMock,
  upsertEstimateResourceLinesMock,
  ensureProjectStagesMock,
  deleteHeroTaskChecklistItemsMock,
  deleteHeroTasksMock,
  upsertHeroTasksMock,
  upsertTaskChecklistItemsMock,
  deleteHeroProcurementItemsMock,
  upsertHeroProcurementItemsMock,
  deleteHeroHRItemsMock,
  upsertHeroHRItemsMock,
} = vi.hoisted(() => ({
  resolveRuntimeWorkspaceModeMock: vi.fn(),
  getLatestHeroTransitionEventMock: vi.fn(),
  insertHeroTransitionEventMock: vi.fn(),
  ensureProjectEstimateRootMock: vi.fn(),
  ensureEstimateCurrentVersionMock: vi.fn(),
  loadCurrentEstimateDraftMock: vi.fn(),
  upsertEstimateWorksMock: vi.fn(),
  upsertEstimateResourceLinesMock: vi.fn(),
  ensureProjectStagesMock: vi.fn(),
  deleteHeroTaskChecklistItemsMock: vi.fn(),
  deleteHeroTasksMock: vi.fn(),
  upsertHeroTasksMock: vi.fn(),
  upsertTaskChecklistItemsMock: vi.fn(),
  deleteHeroProcurementItemsMock: vi.fn(),
  upsertHeroProcurementItemsMock: vi.fn(),
  deleteHeroHRItemsMock: vi.fn(),
  upsertHeroHRItemsMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/data/workspace-source", () => ({
  resolveRuntimeWorkspaceMode: resolveRuntimeWorkspaceModeMock,
}));

vi.mock("@/data/activity-source", () => ({
  getLatestHeroTransitionEvent: getLatestHeroTransitionEventMock,
  insertHeroTransitionEvent: insertHeroTransitionEventMock,
}));

vi.mock("@/data/estimate-source", () => ({
  ensureProjectEstimateRoot: ensureProjectEstimateRootMock,
  ensureEstimateCurrentVersion: ensureEstimateCurrentVersionMock,
  loadCurrentEstimateDraft: loadCurrentEstimateDraftMock,
  upsertEstimateWorks: upsertEstimateWorksMock,
  upsertEstimateResourceLines: upsertEstimateResourceLinesMock,
}));

vi.mock("@/data/planning-source", () => ({
  deleteHeroTaskChecklistItems: deleteHeroTaskChecklistItemsMock,
  deleteHeroTasks: deleteHeroTasksMock,
  ensureProjectStages: ensureProjectStagesMock,
  upsertHeroTasks: upsertHeroTasksMock,
  upsertTaskChecklistItems: upsertTaskChecklistItemsMock,
}));

vi.mock("@/data/procurement-source", () => ({
  deleteHeroProcurementItems: deleteHeroProcurementItemsMock,
  upsertHeroProcurementItems: upsertHeroProcurementItemsMock,
}));

vi.mock("@/data/hr-source", () => ({
  deleteHeroHRItems: deleteHeroHRItemsMock,
  upsertHeroHRItems: upsertHeroHRItemsMock,
}));

import { persistEstimateV2HeroTransition } from "@/data/estimate-v2-hero-transition";
import {
  loadEstimateV2HeroTransitionCache,
  loadEstimateV2HeroTransitionBlocked,
  saveEstimateV2HeroTransitionBlocked,
  saveEstimateV2HeroTransitionPending,
} from "@/data/estimate-v2-transition-cache";

describe("persistEstimateV2HeroTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    resolveRuntimeWorkspaceModeMock.mockResolvedValue({
      kind: "supabase",
      profileId: "profile-1",
    });
    getLatestHeroTransitionEventMock.mockResolvedValue(null);
    ensureProjectStagesMock.mockResolvedValue({
      "stage-existing": "stage-existing",
    });
    ensureProjectEstimateRootMock.mockResolvedValue({
      ok: true,
      row: {
        id: "estimate-existing",
      },
    });
    ensureEstimateCurrentVersionMock.mockResolvedValue({
      ok: true,
      row: {
        id: "version-existing",
      },
    });
    loadCurrentEstimateDraftMock.mockResolvedValue({
      estimate: {
        id: "estimate-existing",
        project_id: "project-1",
        title: "Project 1",
        description: null,
        status: "draft",
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
      currentVersion: {
        id: "version-existing",
        estimate_id: "estimate-existing",
        version_number: 1,
        is_current: true,
        created_by: "profile-1",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      stages: [
        {
          id: "stage-existing",
          project_id: "project-1",
          title: "Shell",
          description: "",
          sort_order: 1,
          status: "open",
          discount_bps: 0,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "work-existing",
          estimate_version_id: "version-existing",
          project_stage_id: "stage-existing",
          title: "Framing",
          description: null,
          sort_order: 1,
          planned_cost_cents: 12500,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      lines: [
        {
          id: "line-existing",
          estimate_work_id: "work-existing",
          resource_type: "material",
          title: "Concrete",
          quantity: 1,
          unit: "bag",
          unit_price_cents: 12500,
          total_price_cents: 12500,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      dependencies: [],
    });
    upsertEstimateWorksMock.mockResolvedValue(undefined);
    upsertEstimateResourceLinesMock.mockResolvedValue(undefined);
    deleteHeroTaskChecklistItemsMock.mockResolvedValue(undefined);
    deleteHeroTasksMock.mockResolvedValue(undefined);
    upsertHeroTasksMock.mockResolvedValue(undefined);
    upsertTaskChecklistItemsMock.mockResolvedValue(undefined);
    deleteHeroProcurementItemsMock.mockResolvedValue(undefined);
    upsertHeroProcurementItemsMock.mockResolvedValue(undefined);
    deleteHeroHRItemsMock.mockResolvedValue(undefined);
    upsertHeroHRItemsMock.mockResolvedValue(undefined);
    insertHeroTransitionEventMock.mockResolvedValue(undefined);
  });

  it("reuses the existing remote draft snapshot ids and clears stale blocked mismatch cache", async () => {
    saveEstimateV2HeroTransitionBlocked({
      projectId: "project-1",
      fingerprint: "stale",
      reason: "Remote estimate snapshot rows already exist but cannot be matched safely. Rovno will not create a second set.",
    });

    const result = await persistEstimateV2HeroTransition({
      projectId: "project-1",
      projectTitle: "Project 1",
      previousStatus: "planning",
      autoScheduled: false,
      stages: [
        {
          localStageId: "stage-existing",
          title: "Shell",
          order: 1,
          discountBps: 0,
        },
      ],
      works: [
        {
          localWorkId: "work-existing",
          localStageId: "stage-existing",
          title: "Framing",
          order: 1,
          plannedStart: "2026-03-10T00:00:00.000Z",
          plannedEnd: "2026-03-11T00:00:00.000Z",
        },
      ],
      lines: [
        {
          localLineId: "line-existing",
          localStageId: "stage-existing",
          localWorkId: "work-existing",
          title: "Concrete",
          type: "material",
          unit: "bag",
          qtyMilli: 1000,
          costUnitCents: 12500,
        },
      ],
    });

    expect(loadEstimateV2HeroTransitionBlocked("project-1")).toBeNull();
    expect(ensureProjectEstimateRootMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        projectId: "project-1",
        estimateId: "estimate-existing",
      }),
    );
    expect(ensureEstimateCurrentVersionMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        estimateId: "estimate-existing",
        versionId: "version-existing",
      }),
    );
    expect(upsertEstimateWorksMock).toHaveBeenCalledWith(
      {},
      expect.arrayContaining([
        expect.objectContaining({
          id: "work-existing",
          estimate_version_id: "version-existing",
          project_stage_id: "stage-existing",
        }),
      ]),
    );
    expect(upsertEstimateResourceLinesMock).toHaveBeenCalledWith(
      {},
      expect.arrayContaining([
        expect.objectContaining({
          id: "line-existing",
          estimate_work_id: "work-existing",
        }),
      ]),
    );
    expect(insertHeroTransitionEventMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        entityId: "estimate-existing",
        payload: expect.objectContaining({
          previousStatus: "planning",
        }),
      }),
    );
    expect(result.ids.estimateId).toBe("estimate-existing");
    expect(result.ids.versionId).toBe("version-existing");
    expect(result.ids.workIdByLocalWorkId["work-existing"]).toBe("work-existing");
    expect(result.ids.lineIdByLocalLineId["line-existing"]).toBe("line-existing");
  });

  it("creates task, checklist, procurement, and HR descendants with estimate lineage on first generation", async () => {
    ensureProjectStagesMock.mockResolvedValue({
      "stage-launch": "stage-remote-launch",
    });

    const result = await persistEstimateV2HeroTransition({
      projectId: "project-1",
      projectTitle: "Project 1",
      previousStatus: "planning",
      autoScheduled: false,
      stages: [
        {
          localStageId: "stage-launch",
          title: "Launch stage",
          order: 1,
          discountBps: 0,
        },
      ],
      works: [
        {
          localWorkId: "work-launch",
          localStageId: "stage-launch",
          title: "Install base",
          order: 1,
          plannedStart: "2026-03-10T00:00:00.000Z",
          plannedEnd: "2026-03-12T00:00:00.000Z",
        },
      ],
      lines: [
        {
          localLineId: "line-material",
          localStageId: "stage-launch",
          localWorkId: "work-launch",
          title: "Wire mesh",
          type: "material",
          unit: "roll",
          qtyMilli: 2000,
          costUnitCents: 1500,
        },
        {
          localLineId: "line-tool",
          localStageId: "stage-launch",
          localWorkId: "work-launch",
          title: "Laser level",
          type: "tool",
          unit: "day",
          qtyMilli: 1000,
          costUnitCents: 3200,
        },
        {
          localLineId: "line-labor",
          localStageId: "stage-launch",
          localWorkId: "work-launch",
          title: "Crew hours",
          type: "labor",
          unit: "shift",
          qtyMilli: 3000,
          costUnitCents: 4200,
        },
        {
          localLineId: "line-subcontractor",
          localStageId: "stage-launch",
          localWorkId: "work-launch",
          title: "Scaffold team",
          type: "subcontractor",
          unit: "job",
          qtyMilli: 1000,
          costUnitCents: 18500,
        },
        {
          localLineId: "line-other",
          localStageId: "stage-launch",
          localWorkId: "work-launch",
          title: "Waste bags",
          type: "other",
          unit: "pack",
          qtyMilli: 1000,
          costUnitCents: 500,
        },
      ],
    });

    const taskId = result.ids.taskIdByLocalWorkId["work-launch"];
    const stageId = result.ids.stageIdByLocalStageId["stage-launch"];
    const workId = result.ids.workIdByLocalWorkId["work-launch"];
    const checklistRows = upsertTaskChecklistItemsMock.mock.calls[0]?.[1];
    const procurementRows = upsertHeroProcurementItemsMock.mock.calls[0]?.[1];
    const hrRows = upsertHeroHRItemsMock.mock.calls[0]?.[1];

    expect(upsertHeroTasksMock).toHaveBeenCalledWith(
      {},
      [
        expect.objectContaining({
          id: taskId,
          projectId: "project-1",
          stageId,
          title: "Install base",
        }),
      ],
    );

    expect(checklistRows).toEqual([
      expect.objectContaining({
        id: result.ids.checklistItemIdByLocalLineId["line-material"],
        taskId,
        title: "Wire mesh",
        procurementItemId: null,
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-material"],
        estimateWorkId: workId,
        sortOrder: 1,
      }),
      expect.objectContaining({
        id: result.ids.checklistItemIdByLocalLineId["line-tool"],
        taskId,
        title: "Laser level",
        procurementItemId: null,
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-tool"],
        estimateWorkId: workId,
        sortOrder: 2,
      }),
      expect.objectContaining({
        id: result.ids.checklistItemIdByLocalLineId["line-labor"],
        taskId,
        title: "Crew hours",
        procurementItemId: null,
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-labor"],
        estimateWorkId: workId,
        sortOrder: 3,
      }),
      expect.objectContaining({
        id: result.ids.checklistItemIdByLocalLineId["line-subcontractor"],
        taskId,
        title: "Scaffold team",
        procurementItemId: null,
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-subcontractor"],
        estimateWorkId: workId,
        sortOrder: 4,
      }),
      expect.objectContaining({
        id: result.ids.checklistItemIdByLocalLineId["line-other"],
        taskId,
        title: "Waste bags",
        procurementItemId: null,
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-other"],
        estimateWorkId: workId,
        sortOrder: 5,
      }),
    ]);

    expect(procurementRows).toEqual([
      expect.objectContaining({
        id: result.ids.procurementItemIdByLocalLineId["line-material"],
        projectId: "project-1",
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-material"],
        taskId,
        title: "Wire mesh",
        quantity: 2,
        unit: "roll",
        plannedUnitPriceCents: 1500,
        plannedTotalPriceCents: 3000,
        status: "requested",
      }),
      expect.objectContaining({
        id: result.ids.procurementItemIdByLocalLineId["line-tool"],
        projectId: "project-1",
        estimateResourceLineId: result.ids.lineIdByLocalLineId["line-tool"],
        taskId,
        title: "Laser level",
        quantity: 1,
        unit: "day",
        plannedUnitPriceCents: 3200,
        plannedTotalPriceCents: 3200,
        status: "requested",
      }),
    ]);

    expect(hrRows).toEqual([
      expect.objectContaining({
        id: result.ids.hrItemIdByLocalLineId["line-labor"],
        projectId: "project-1",
        projectStageId: stageId,
        estimateWorkId: workId,
        taskId,
        title: "Crew hours",
        plannedCostCents: 12600,
      }),
      expect.objectContaining({
        id: result.ids.hrItemIdByLocalLineId["line-subcontractor"],
        projectId: "project-1",
        projectStageId: stageId,
        estimateWorkId: workId,
        taskId,
        title: "Scaffold team",
        plannedCostCents: 18500,
      }),
    ]);
  });

  it("clears the stale partial-transition blocker and retries without requiring a reload", async () => {
    saveEstimateV2HeroTransitionBlocked({
      projectId: "project-1",
      fingerprint: "stale-partial",
      reason: "Estimate changed after a partial remote transition. Reload the page before trying again.",
    });

    const result = await persistEstimateV2HeroTransition({
      projectId: "project-1",
      projectTitle: "Project 1",
      previousStatus: "planning",
      autoScheduled: false,
      stages: [
        {
          localStageId: "stage-existing",
          title: "Shell",
          order: 1,
          discountBps: 0,
        },
      ],
      works: [
        {
          localWorkId: "work-existing",
          localStageId: "stage-existing",
          title: "Framing",
          order: 1,
          plannedStart: "2026-03-10T00:00:00.000Z",
          plannedEnd: "2026-03-11T00:00:00.000Z",
        },
      ],
      lines: [
        {
          localLineId: "line-existing",
          localStageId: "stage-existing",
          localWorkId: "work-existing",
          title: "Concrete",
          type: "material",
          unit: "bag",
          qtyMilli: 1000,
          costUnitCents: 12500,
        },
      ],
    });

    expect(loadEstimateV2HeroTransitionBlocked("project-1")).toBeNull();
    expect(result.ids.taskIdByLocalWorkId["work-existing"]).toBeTruthy();
    expect(insertHeroTransitionEventMock).toHaveBeenCalledOnce();
  });

  it("resumes from a stale pending cache, reuses overlapping downstream ids, and cleans up removed rows", async () => {
    saveEstimateV2HeroTransitionPending({
      projectId: "project-1",
      fingerprint: "stale-fingerprint",
      ids: {
        estimateId: "estimate-stale",
        versionId: "version-stale",
        eventId: "event-stale",
        stageIdByLocalStageId: {
          "stage-existing": "stage-existing",
        },
        workIdByLocalWorkId: {
          "work-existing": "work-existing",
          "work-removed": "work-removed",
        },
        lineIdByLocalLineId: {
          "line-existing": "line-existing",
          "line-removed": "line-removed",
          "line-removed-hr": "line-removed-hr",
        },
        taskIdByLocalWorkId: {
          "work-existing": "task-existing-stale",
          "work-removed": "task-removed-stale",
        },
        checklistItemIdByLocalLineId: {
          "line-existing": "check-existing-stale",
          "line-removed": "check-removed-stale",
          "line-removed-hr": "check-removed-hr-stale",
        },
        procurementItemIdByLocalLineId: {
          "line-existing": "proc-existing-stale",
          "line-removed": "proc-removed-stale",
        },
        hrItemIdByLocalLineId: {
          "line-removed-hr": "hr-removed-stale",
        },
      },
    });

    const result = await persistEstimateV2HeroTransition({
      projectId: "project-1",
      projectTitle: "Project 1",
      previousStatus: "planning",
      autoScheduled: false,
      stages: [
        {
          localStageId: "stage-existing",
          title: "Shell",
          order: 1,
          discountBps: 0,
        },
      ],
      works: [
        {
          localWorkId: "work-existing",
          localStageId: "stage-existing",
          title: "Framing",
          order: 1,
          plannedStart: "2026-03-10T00:00:00.000Z",
          plannedEnd: "2026-03-11T00:00:00.000Z",
        },
        {
          localWorkId: "work-new",
          localStageId: "stage-existing",
          title: "Drywall",
          order: 2,
          plannedStart: "2026-03-12T00:00:00.000Z",
          plannedEnd: "2026-03-13T00:00:00.000Z",
        },
      ],
      lines: [
        {
          localLineId: "line-existing",
          localStageId: "stage-existing",
          localWorkId: "work-existing",
          title: "Concrete",
          type: "material",
          unit: "bag",
          qtyMilli: 1000,
          costUnitCents: 12500,
        },
        {
          localLineId: "line-new",
          localStageId: "stage-existing",
          localWorkId: "work-new",
          title: "Panels",
          type: "material",
          unit: "pcs",
          qtyMilli: 2000,
          costUnitCents: 3500,
        },
      ],
    });

    expect(deleteHeroTaskChecklistItemsMock).toHaveBeenCalledWith(
      {},
      expect.arrayContaining(["check-removed-stale", "check-removed-hr-stale"]),
    );
    expect(deleteHeroProcurementItemsMock).toHaveBeenCalledWith(
      {},
      ["proc-removed-stale"],
    );
    expect(deleteHeroHRItemsMock).toHaveBeenCalledWith(
      {},
      ["hr-removed-stale"],
    );
    expect(deleteHeroTasksMock).toHaveBeenCalledWith(
      {},
      ["task-removed-stale"],
    );
    expect(result.ids.taskIdByLocalWorkId["work-existing"]).toBe("task-existing-stale");
    expect(result.ids.checklistItemIdByLocalLineId["line-existing"]).toBe("check-existing-stale");
    expect(result.ids.procurementItemIdByLocalLineId["line-existing"]).toBe("proc-existing-stale");
    expect(result.ids.taskIdByLocalWorkId["work-new"]).toBeTruthy();
    expect(result.ids.taskIdByLocalWorkId["work-new"]).not.toBe("task-existing-stale");
    expect(upsertHeroTasksMock).toHaveBeenCalledWith(
      {},
      expect.arrayContaining([
        expect.objectContaining({ id: "task-existing-stale", title: "Framing" }),
        expect.objectContaining({ title: "Drywall" }),
      ]),
    );
  });

  it("short-circuits to success when an older remote event already covers the current draft", async () => {
    getLatestHeroTransitionEventMock.mockResolvedValue({
      id: "event-existing",
      payload: {
        source: "estimate_v2.hero_transition",
        fingerprint: "older-fingerprint",
        previousStatus: "planning",
        nextStatus: "in_work",
        autoScheduled: false,
        ids: {
          estimateId: "estimate-existing",
          versionId: "version-existing",
          eventId: "event-existing",
          stageIdByLocalStageId: {
            "stage-existing": "stage-existing",
          },
          workIdByLocalWorkId: {
            "work-existing": "work-existing",
          },
          lineIdByLocalLineId: {
            "line-existing": "line-existing",
          },
          taskIdByLocalWorkId: {
            "work-existing": "task-existing",
          },
          checklistItemIdByLocalLineId: {
            "line-existing": "check-existing",
          },
          procurementItemIdByLocalLineId: {
            "line-existing": "proc-existing",
          },
          hrItemIdByLocalLineId: {},
        },
      },
    });

    const result = await persistEstimateV2HeroTransition({
      projectId: "project-1",
      projectTitle: "Project 1",
      previousStatus: "planning",
      autoScheduled: false,
      stages: [
        {
          localStageId: "stage-existing",
          title: "Shell",
          order: 1,
          discountBps: 0,
        },
      ],
      works: [
        {
          localWorkId: "work-existing",
          localStageId: "stage-existing",
          title: "Framing",
          order: 1,
          plannedStart: "2026-03-10T00:00:00.000Z",
          plannedEnd: "2026-03-11T00:00:00.000Z",
        },
      ],
      lines: [
        {
          localLineId: "line-existing",
          localStageId: "stage-existing",
          localWorkId: "work-existing",
          title: "Concrete",
          type: "material",
          unit: "bag",
          qtyMilli: 1000,
          costUnitCents: 12500,
        },
      ],
    });

    const cache = loadEstimateV2HeroTransitionCache("project-1");

    expect(result.ids.taskIdByLocalWorkId["work-existing"]).toBe("task-existing");
    expect(insertHeroTransitionEventMock).not.toHaveBeenCalled();
    expect(ensureProjectEstimateRootMock).not.toHaveBeenCalled();
    expect(upsertHeroTasksMock).not.toHaveBeenCalled();
    expect(cache?.status).toBe("completed");
    expect(cache?.ids.taskIdByLocalWorkId["work-existing"]).toBe("task-existing");
  });
});
