import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadCurrentEstimateDraftMock,
  saveCurrentEstimateDraftMock,
  syncEstimateProjectionRemoteMock,
  emitEstimateDraftSyncEventMock,
  getWorkspaceSourceMock,
  getPlanningSourceMock,
  persistEstimateV2HeroTransitionMock,
  syncProjectTasksFromEstimateMock,
  syncProjectProcurementFromEstimateMock,
  syncProjectHRFromEstimateMock,
} = vi.hoisted(() => ({
  loadCurrentEstimateDraftMock: vi.fn(),
  saveCurrentEstimateDraftMock: vi.fn(),
  syncEstimateProjectionRemoteMock: vi.fn(),
  emitEstimateDraftSyncEventMock: vi.fn(),
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
    syncEstimateProjectionRemote: syncEstimateProjectionRemoteMock,
    emitEstimateDraftSyncEvent: emitEstimateDraftSyncEventMock,
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
  clearEstimateV2ProjectAccessContext,
  createWork,
  getEstimateV2ProjectionCapability,
  getEstimateV2ProjectState,
  hydrateEstimateV2ProjectFromWorkspace,
  registerEstimateV2ProjectAccessContext,
  updateLine,
} from "@/data/estimate-v2-store";
import { EstimateDraftConflictError, SyncEstimateProjectionUnavailableError } from "@/data/estimate-source";
import { __unsafeResetStoreForTests } from "@/data/store";

const PROJECT_ID = "project-remote-1";

function serverDraft(options: { withStructure: boolean }) {
  return {
    estimate: {
      id: "estimate-1",
      project_id: PROJECT_ID,
      title: "Remote Estimate",
      description: null,
      status: "approved",
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
    stages: options.withStructure
      ? [{
        id: "11111111-1111-4111-8111-111111111111",
        project_id: PROJECT_ID,
        title: "Shell",
        description: "",
        sort_order: 1,
        status: "open",
        discount_bps: 0,
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-02T00:00:00.000Z",
      }]
      : [],
    works: options.withStructure
      ? [{
        id: "22222222-2222-4222-8222-222222222222",
        estimate_version_id: "version-1",
        project_stage_id: "11111111-1111-4111-8111-111111111111",
        title: "Framing",
        description: null,
        sort_order: 1,
        planned_cost_cents: 30000,
        created_at: "2026-03-01T00:00:00.000Z",
      }]
      : [],
    lines: options.withStructure
      ? [{
        id: "33333333-3333-4333-8333-333333333333",
        estimate_work_id: "22222222-2222-4222-8222-222222222222",
        title: "Lumber",
        resource_type: "material",
        quantity: 2,
        unit: "m3",
        unit_price_cents: 5000,
        markup_bps: 0,
        discount_bps_override: null,
        assignee_profile_id: null,
        assignee_label: null,
        created_at: "2026-03-01T00:00:00.000Z",
      }]
      : [],
    dependencies: [],
  };
}

function registerOwnerContext() {
  registerEstimateV2ProjectAccessContext(PROJECT_ID, {
    mode: "supabase",
    profileId: "profile-1",
    projectOwnerProfileId: "profile-1",
    membershipRole: "owner",
  });
}

function registerSummaryCoOwnerContext() {
  registerEstimateV2ProjectAccessContext(PROJECT_ID, {
    mode: "supabase",
    profileId: "profile-2",
    projectOwnerProfileId: "profile-1",
    membershipRole: "co_owner",
    financeVisibility: "summary",
  });
}

describe("estimate-v2 sync-state honesty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    localStorage.clear();
    sessionStorage.clear();

    getWorkspaceSourceMock.mockResolvedValue({
      getProjectById: vi.fn().mockResolvedValue({
        id: PROJECT_ID,
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
    syncProjectTasksFromEstimateMock.mockResolvedValue({});
    syncProjectProcurementFromEstimateMock.mockResolvedValue(undefined);
    syncProjectHRFromEstimateMock.mockResolvedValue(undefined);
    saveCurrentEstimateDraftMock.mockResolvedValue(undefined);
    emitEstimateDraftSyncEventMock.mockResolvedValue(undefined);
    // Default to a pre-P1 database so the pinned suites keep exercising the
    // legacy client pipeline (still shipped as the fallback); RPC-path tests
    // override this per test.
    syncEstimateProjectionRemoteMock.mockImplementation(async () => {
      throw new SyncEstimateProjectionUnavailableError();
    });
    loadCurrentEstimateDraftMock.mockResolvedValue(serverDraft({ withStructure: true }));
  });

  it("marks a non-detail co-owner editor blocked_permission instead of stuck pending, and never fakes synced", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-2" });
      registerSummaryCoOwnerContext();

      const created = createWork(PROJECT_ID, {
        stageId: getEstimateV2ProjectState(PROJECT_ID).stages[0]?.id ?? "",
        title: "Roof",
      });
      expect(created).not.toBeNull();

      await vi.advanceTimersByTimeAsync(350);

      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      expect(sync.draftSaveStatus).toBe("blocked_permission");
      expect(saveCurrentEstimateDraftMock).not.toHaveBeenCalled();
      expect(syncProjectTasksFromEstimateMock).not.toHaveBeenCalled();
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(sync.domains[domain].status).toBe("skipped");
        expect(sync.domains[domain].skipReason).toBe("permission");
        expect(sync.domains[domain].projectedRevision).toBeNull();
      });
      expect(getEstimateV2ProjectionCapability(PROJECT_ID)).toBe("blocked_permission");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports skipped (unauthoritative), not synced, when an empty snapshot cannot be projected", async () => {
    vi.useFakeTimers();
    try {
      loadCurrentEstimateDraftMock.mockResolvedValue(serverDraft({ withStructure: false }));
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();

      await vi.advanceTimersByTimeAsync(350);

      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      expect(getEstimateV2ProjectState(PROJECT_ID).project.estimateStatus).toBe("in_work");
      expect(syncProjectTasksFromEstimateMock).not.toHaveBeenCalled();
      expect(syncProjectProcurementFromEstimateMock).not.toHaveBeenCalled();
      expect(syncProjectHRFromEstimateMock).not.toHaveBeenCalled();
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(sync.domains[domain].status).toBe("skipped");
        expect(sync.domains[domain].skipReason).toBe("unauthoritative");
        expect(sync.domains[domain].projectedRevision).toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the fan-out when the tasks projection fails: procurement and HR report blocked, not synced", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      syncProjectTasksFromEstimateMock.mockRejectedValue(new Error("boom"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await vi.advanceTimersByTimeAsync(350);

      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      expect(sync.domains.tasks.status).toBe("error");
      expect(sync.domains.tasks.lastError).toBe("boom");
      expect(sync.domains.procurement.status).toBe("error");
      expect(sync.domains.procurement.lastError).toBe("Blocked: tasks projection failed.");
      expect(sync.domains.hr.status).toBe("error");
      expect(sync.domains.hr.lastError).toBe("Blocked: tasks projection failed.");
      expect(syncProjectProcurementFromEstimateMock).not.toHaveBeenCalled();
      expect(syncProjectHRFromEstimateMock).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never leaves a domain stuck in syncing after a drift-aborted run", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();

      let resolveSave!: () => void;
      saveCurrentEstimateDraftMock.mockImplementation(() => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }));

      const state = getEstimateV2ProjectState(PROJECT_ID);
      const lineId = state.lines[0]?.id ?? "";
      expect(lineId).not.toBe("");

      updateLine(PROJECT_ID, lineId, { title: "Lumber v2" });
      await vi.advanceTimersByTimeAsync(350);

      // The run is now blocked inside saveCurrentEstimateDraft with all three
      // domains marked "syncing". A newer edit lands, superseding the run.
      expect(getEstimateV2ProjectState(PROJECT_ID).sync.domains.tasks.status).toBe("syncing");
      updateLine(PROJECT_ID, lineId, { title: "Lumber v3" });

      resolveSave();
      await vi.advanceTimersByTimeAsync(0);

      // The aborted run must not leave "syncing" behind (it would spin forever).
      const syncAfterAbort = getEstimateV2ProjectState(PROJECT_ID).sync;
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(syncAfterAbort.domains[domain].status).not.toBe("syncing");
      });

      // The deferred rerun then projects the fresh revision to completion.
      saveCurrentEstimateDraftMock.mockResolvedValue(undefined);
      await vi.advanceTimersByTimeAsync(350);
      const finalSync = getEstimateV2ProjectState(PROJECT_ID).sync;
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(finalSync.domains[domain].status).toBe("synced");
        expect(finalSync.domains[domain].projectedRevision).toBe(finalSync.estimateRevision);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains projection capability after the registering page unmounts", async () => {
    await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
    registerOwnerContext();
    expect(getEstimateV2ProjectionCapability(PROJECT_ID)).toBe("projector");

    clearEstimateV2ProjectAccessContext(PROJECT_ID);
    expect(getEstimateV2ProjectionCapability(PROJECT_ID)).toBe("projector");
  });

  it("reports reader capability when no context was ever registered", () => {
    expect(getEstimateV2ProjectionCapability("project-unknown")).toBe("reader");
  });

  it("projects via the server RPC: one call, task ids applied, all domains synced, no legacy fan-out", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      syncEstimateProjectionRemoteMock.mockResolvedValue({
        status: "projected",
        reason: null,
        taskIdByWorkId: { "22222222-2222-4222-8222-222222222222": "task-rpc-1" },
        skippedWorkIds: [],
        projectionSeq: 7,
      });

      await vi.advanceTimersByTimeAsync(350);

      const state = getEstimateV2ProjectState(PROJECT_ID);
      expect(syncEstimateProjectionRemoteMock).toHaveBeenCalledTimes(1);
      expect(syncProjectTasksFromEstimateMock).not.toHaveBeenCalled();
      expect(syncProjectProcurementFromEstimateMock).not.toHaveBeenCalled();
      expect(syncProjectHRFromEstimateMock).not.toHaveBeenCalled();
      expect(state.works.find((work) => work.id === "22222222-2222-4222-8222-222222222222")?.taskId)
        .toBe("task-rpc-1");
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(state.sync.domains[domain].status).toBe("synced");
        expect(state.sync.domains[domain].projectedRevision).toBe(state.sync.estimateRevision);
      });
      expect(emitEstimateDraftSyncEventMock).toHaveBeenCalledWith(PROJECT_ID, state.sync.estimateRevision);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks all domains error when the projection RPC fails hard", async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      syncEstimateProjectionRemoteMock.mockRejectedValue(new Error("projection exploded"));

      await vi.advanceTimersByTimeAsync(350);

      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(sync.domains[domain].status).toBe("error");
        expect(sync.domains[domain].lastError).toBe("projection exploded");
      });
      expect(syncProjectTasksFromEstimateMock).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("reports skipped when the server declines to project", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      syncEstimateProjectionRemoteMock.mockResolvedValue({
        status: "skipped",
        reason: "empty_draft",
        taskIdByWorkId: {},
        skippedWorkIds: [],
        projectionSeq: null,
      });

      await vi.advanceTimersByTimeAsync(350);

      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(sync.domains[domain].status).toBe("skipped");
        expect(sync.domains[domain].skipReason).toBe("unauthoritative");
        expect(sync.domains[domain].projectedRevision).toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the legacy client pipeline on pre-P1 databases", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      // beforeEach default: syncEstimateProjectionRemote throws Unavailable.

      await vi.advanceTimersByTimeAsync(350);

      expect(syncEstimateProjectionRemoteMock).toHaveBeenCalledTimes(1);
      expect(syncProjectTasksFromEstimateMock).toHaveBeenCalledTimes(1);
      expect(syncProjectProcurementFromEstimateMock).toHaveBeenCalledTimes(1);
      expect(syncProjectHRFromEstimateMock).toHaveBeenCalledTimes(1);
      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(sync.domains[domain].status).toBe("synced");
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("converges on a draft conflict: status conflict, forced re-hydrate, no domain errors", async () => {
    vi.useFakeTimers();
    try {
      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      saveCurrentEstimateDraftMock.mockRejectedValue(new EstimateDraftConflictError());
      const hydrateCallsBefore = loadCurrentEstimateDraftMock.mock.calls.length;

      // Gate the forced re-hydrate so the intermediate "conflict" state is
      // observable before convergence completes.
      let resolveReload!: (value: unknown) => void;
      loadCurrentEstimateDraftMock.mockImplementation(() => new Promise((resolve) => {
        resolveReload = resolve;
      }));

      const created = createWork(PROJECT_ID, {
        stageId: getEstimateV2ProjectState(PROJECT_ID).stages[0]?.id ?? "",
        title: "Roof",
      });
      expect(created).not.toBeNull();
      await vi.advanceTimersByTimeAsync(350);

      const sync = getEstimateV2ProjectState(PROJECT_ID).sync;
      expect(sync.draftSaveStatus).toBe("conflict");
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        expect(sync.domains[domain].status).not.toBe("error");
      });
      expect(syncEstimateProjectionRemoteMock).not.toHaveBeenCalled();
      // The forced re-hydrate reloads the server draft (convergence)...
      expect(loadCurrentEstimateDraftMock.mock.calls.length).toBeGreaterThan(hydrateCallsBefore);

      // ...and once the reload lands, autosave resumes from the server truth.
      saveCurrentEstimateDraftMock.mockResolvedValue(undefined);
      resolveReload(serverDraft({ withStructure: true }));
      await vi.advanceTimersByTimeAsync(700);
      const syncAfter = getEstimateV2ProjectState(PROJECT_ID).sync;
      expect(syncAfter.draftSaveStatus).not.toBe("conflict");
      expect(syncAfter.draftSaveStatus).not.toBe("error");
    } finally {
      vi.useRealTimers();
    }
  });

  it("trusts the server execution_status over the cached local status", async () => {
    // Cache says in_work (a stale local mirror); the server says paused.
    await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
    registerOwnerContext();
    const cacheKey = `estimate-v2-workspace:${PROJECT_ID}:profile-1`;
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    expect(cached).not.toBeNull();
    cached.state.project.estimateStatus = "in_work";
    localStorage.setItem(cacheKey, JSON.stringify(cached));

    const pausedDraft = serverDraft({ withStructure: true });
    (pausedDraft.estimate as { execution_status?: string }).execution_status = "paused";
    loadCurrentEstimateDraftMock.mockResolvedValue(pausedDraft);

    await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1", forceFresh: true });
    expect(getEstimateV2ProjectState(PROJECT_ID).project.estimateStatus).toBe("paused");
  });

  it("never caches or autosaves a default-seeded state before hydration installs remote truth", async () => {
    vi.useFakeTimers();
    try {
      // Cold project-page load: a getter default-seeds the in-memory state
      // before any remote data exists (sync indicator / any project page).
      const defaultView = getEstimateV2ProjectState(PROJECT_ID);
      expect(defaultView.project.estimateStatus).toBe("planning");

      // Layout registers the owner context; hydration is DELAYED beyond the
      // 300ms debounce (slow network).
      let resolveDraft!: (value: unknown) => void;
      loadCurrentEstimateDraftMock.mockImplementation(() => new Promise((resolve) => {
        resolveDraft = resolve;
      }));
      registerOwnerContext();
      const hydration = hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });

      await vi.advanceTimersByTimeAsync(700);

      // The placeholder must not be persisted anywhere: no autosave of the
      // default snapshot, no clobbering of the profile's workspace cache.
      expect(saveCurrentEstimateDraftMock).not.toHaveBeenCalled();
      expect(localStorage.getItem(`estimate-v2-workspace:${PROJECT_ID}:profile-1`)).toBeNull();

      // Hydration lands; a real edit then queues and saves the hydrated state.
      resolveDraft(serverDraft({ withStructure: true }));
      await hydration;
      const created = createWork(PROJECT_ID, {
        stageId: getEstimateV2ProjectState(PROJECT_ID).stages[0]?.id ?? "",
        title: "Roof",
      });
      expect(created).not.toBeNull();
      await vi.advanceTimersByTimeAsync(350);

      expect(saveCurrentEstimateDraftMock).toHaveBeenCalled();
      expect(saveCurrentEstimateDraftMock).toHaveBeenLastCalledWith(
        PROJECT_ID,
        expect.objectContaining({
          works: expect.arrayContaining([
            expect.objectContaining({ title: "Framing" }),
            expect.objectContaining({ title: "Roof" }),
          ]),
        }),
        expect.objectContaining({ profileId: "profile-1" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the previous account's runtime state when a different profile hydrates the project", async () => {
    await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
    registerOwnerContext();
    clearEstimateV2ProjectAccessContext(PROJECT_ID);
    expect(getEstimateV2ProjectionCapability(PROJECT_ID)).toBe("projector");

    // Same tab, different account (owner logged out, member logged in): the
    // retained owner context must not lend its capability to the new session.
    await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-2" });
    expect(getEstimateV2ProjectionCapability(PROJECT_ID)).toBe("reader");
  });

  it("re-queues an unflushed planning draft save after reload instead of stranding it at pending", async () => {
    vi.useFakeTimers();
    try {
      // Planning-status draft with structure: hydrate seeds a cache whose
      // draftSaveStatus is "pending" (tab closed mid-debounce last session).
      const draft = serverDraft({ withStructure: true });
      draft.estimate.status = "draft";
      loadCurrentEstimateDraftMock.mockResolvedValue(draft);

      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      expect(getEstimateV2ProjectState(PROJECT_ID).project.estimateStatus).toBe("planning");

      const cacheKey = `estimate-v2-workspace:${PROJECT_ID}:profile-1`;
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
      expect(cached).not.toBeNull();
      cached.state.sync.draftSaveStatus = "pending";
      localStorage.setItem(cacheKey, JSON.stringify(cached));

      // Simulate the reload: fresh runtime, remote draft empty (server never got
      // the edits), cache carries them.
      __unsafeResetEstimateV2ForTests();
      loadCurrentEstimateDraftMock.mockResolvedValue(serverDraft({ withStructure: false }));
      // Remote-empty + cached → the cached-path hydrate branch.
      const emptyRemote = { ...serverDraft({ withStructure: false }), estimate: null, currentVersion: null };
      loadCurrentEstimateDraftMock.mockResolvedValue(emptyRemote);

      await hydrateEstimateV2ProjectFromWorkspace(PROJECT_ID, { profileId: "profile-1" });
      registerOwnerContext();
      await vi.advanceTimersByTimeAsync(350);

      expect(saveCurrentEstimateDraftMock).toHaveBeenCalled();
      expect(getEstimateV2ProjectState(PROJECT_ID).sync.draftSaveStatus).toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });
});
