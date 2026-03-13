import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadCurrentEstimateDraftMock,
  saveCurrentEstimateDraftMock,
  getWorkspaceSourceMock,
  getPlanningSourceMock,
} = vi.hoisted(() => ({
  loadCurrentEstimateDraftMock: vi.fn(),
  saveCurrentEstimateDraftMock: vi.fn(),
  getWorkspaceSourceMock: vi.fn(),
  getPlanningSourceMock: vi.fn(),
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
  };
});

import {
  __unsafeResetEstimateV2ForTests,
  createWork,
  createStage,
  getEstimateV2ProjectState,
  hydrateEstimateV2ProjectFromWorkspace,
  registerEstimateV2ProjectAccessContext,
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
        { profileId: "profile-1" },
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
