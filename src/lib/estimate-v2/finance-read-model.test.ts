import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __unsafeResetStoreForTests,
  addMember,
  addProject,
  getEstimate,
  updateEstimateItems,
} from "@/data/store";
import * as store from "@/data/store";
import {
  __unsafeResetEstimateV2ForTests,
  createLine,
  getEstimateV2ProjectState,
  updateEstimateV2Project,
} from "@/data/estimate-v2-store";
import {
  buildEstimateV2FinanceProjectSummary,
  getEstimateV2FinanceProjectSummary,
  type EstimateV2FinanceTaskSlice,
} from "@/lib/estimate-v2/finance-read-model";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import { computeFactFromProcurementAndHR, type FactRollups } from "@/lib/estimate-v2/rollups";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import type {
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  EstimateV2Work,
  ScheduleBaseline,
} from "@/types/estimate-v2";

describe("estimate-v2 finance read model", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  it("builds a populated summary from estimate-v2 state and live actuals", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Budget line",
      type: "material",
      qtyMilli: 2_000,
      costUnitCents: 125_000,
    });

    const summary = getEstimateV2FinanceProjectSummary("project-1");

    expect(summary).not.toBeNull();
    expect(summary?.hasEstimate).toBe(true);
    expect(summary?.plannedBudgetCents).toBeGreaterThan(0);
    expect(summary?.spentCents).toBeGreaterThanOrEqual(0);
    expect(summary?.toBePaidCents).toBeGreaterThanOrEqual(0);
    const stateAfter = getEstimateV2ProjectState("project-1");
    const totals = computeProjectTotals(
      stateAfter.project,
      stateAfter.stages,
      stateAfter.works,
      stateAfter.lines,
      stateAfter.project.projectMode,
    );
    const expectedProfitPct = totals.taxableBaseCents > 0
      ? ((totals.taxableBaseCents - totals.costTotalCents) / totals.taxableBaseCents) * 100
      : null;
    expect(summary?.percentProfitability).toBe(expectedProfitPct);
    expect(summary?.status).toBeTruthy();
  });

  it("ignores legacy browser estimate edits when computing live finance totals", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Summary line",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 50_000,
    });

    const before = getEstimateV2FinanceProjectSummary("project-1");
    const legacyEstimate = getEstimate("project-1");
    if (!legacyEstimate?.versions[0]) {
      throw new Error("Expected seeded legacy estimate version");
    }

    const legacyVersion = legacyEstimate.versions[0];
    updateEstimateItems(
      legacyVersion.id,
      legacyVersion.items.map((item) => ({
        ...item,
        planned_cost: 99_999_999,
        paid_cost: 88_888_888,
      })),
    );

    const after = getEstimateV2FinanceProjectSummary("project-1");

    expect(after).toEqual(before);
  });

  it("returns an empty summary for a project with no estimate-v2 content yet", () => {
    addProject({
      id: "project-empty-finance",
      owner_id: "user-1",
      title: "Empty finance project",
      type: "renovation",
      automation_level: "medium",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: "project-empty-finance",
      user_id: "user-1",
      role: "owner",
      ai_access: "project_pool",
      finance_visibility: "detail",
      credit_limit: 0,
      used_credits: 0,
    });

    const summary = getEstimateV2FinanceProjectSummary("project-empty-finance");

    expect(summary).not.toBeNull();
    expect(summary?.hasEstimate).toBe(false);
    expect(summary?.plannedBudgetCents).toBe(0);
    expect(summary?.spentCents).toBe(0);
  });

  it("can resolve a project summary from an explicit project input when the browser store project is unavailable", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Explicit project line",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 40_000,
    });

    const getProjectSpy = vi.spyOn(store, "getProject").mockReturnValue(undefined);

    try {
      const summary = getEstimateV2FinanceProjectSummary("project-1", {
        id: "project-1",
        title: "Apartment Renovation",
      });

      expect(summary).not.toBeNull();
      expect(summary?.projectTitle).toBe("Apartment Renovation");
      expect(summary?.hasEstimate).toBe(true);
      expect(summary?.plannedBudgetCents).toBeGreaterThan(0);
    } finally {
      getProjectSpy.mockRestore();
    }
  });

  it("does not use line receivedCents as a spent override (Estimate uses procurement/HR fact rollups only)", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Received-only line",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 90_000,
    });
    updateEstimateV2Project("project-1", { receivedCents: 9_000_000 });

    const summary = getEstimateV2FinanceProjectSummary("project-1");
    if (!summary) {
      throw new Error("Expected summary for seeded project");
    }

    const factOnly = computeFactFromProcurementAndHR("project-1");
    expect(summary.spentCents).toBe(factOnly.spentCents);
    expect(summary.spentCents).toBeLessThan(9_000_000);
    expect(summary.toBePaidCents).toBe(factOnly.toBePaidPlannedCents);
    const stateAfter = getEstimateV2ProjectState("project-1");
    const totals = computeProjectTotals(
      stateAfter.project,
      stateAfter.stages,
      stateAfter.works,
      stateAfter.lines,
      stateAfter.project.projectMode,
    );
    const expectedProfitPct = totals.taxableBaseCents > 0
      ? ((totals.taxableBaseCents - totals.costTotalCents) / totals.taxableBaseCents) * 100
      : null;
    expect(summary.percentProfitability).toBe(expectedProfitPct);
  });
});

// --- Pure-fixture tests for the Phase 2 summary fields (contract/cost/margin/utilization/timing) ---

function fixtureProject(partial: Partial<EstimateV2Project> = {}): EstimateV2Project {
  return {
    id: "estimate-v2-fixture",
    projectId: "project-fixture",
    title: "Project",
    projectMode: "contractor",
    currency: "RUB",
    taxBps: 1_000,
    discountBps: 0,
    markupBps: 1_000,
    estimateStatus: "in_work",
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function fixtureStage(): EstimateV2Stage {
  return {
    id: "stage-1",
    projectId: "project-fixture",
    title: "Stage",
    order: 1,
    discountBps: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function fixtureWork(partial: Partial<EstimateV2Work> = {}): EstimateV2Work {
  return {
    id: "work-1",
    projectId: "project-fixture",
    stageId: "stage-1",
    title: "Work",
    order: 1,
    discountBps: 0,
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function fixtureLine(partial: Partial<EstimateV2ResourceLine> = {}): EstimateV2ResourceLine {
  return {
    id: "line-1",
    projectId: "project-fixture",
    stageId: "stage-1",
    workId: "work-1",
    title: "Line",
    type: "material",
    unit: "pcs",
    qtyMilli: 1_000,
    costUnitCents: 10_000,
    markupBps: 0,
    discountBpsOverride: null,
    assigneeId: null,
    assigneeName: null,
    assigneeEmail: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function fixtureFact(partial: Partial<FactRollups> = {}): FactRollups {
  return {
    spentCents: 0,
    spentByTypeCents: { material: 0, tool: 0, labor: 0, subcontractor: 0, overhead: 0, other: 0 },
    unattributedSpendCents: 0,
    toBePaidPlannedCents: 0,
    spentAbovePlannedCents: 0,
    ...partial,
  };
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const OVERDUE_BASELINE: ScheduleBaseline = {
  capturedAt: "2025-01-01T00:00:00.000Z",
  projectBaselineStart: "2025-01-01T00:00:00.000Z",
  projectBaselineEnd: "2025-01-01T00:00:00.000Z",
  works: [],
};

function buildFixtureSummary(input: {
  works?: EstimateV2Work[];
  scheduleBaseline?: ScheduleBaseline | null;
  tasks?: EstimateV2FinanceTaskSlice[];
  factOverrides?: Partial<FactRollups>;
}) {
  return buildEstimateV2FinanceProjectSummary(
    "project-fixture",
    "Project",
    {
      project: fixtureProject(),
      stages: [fixtureStage()],
      works: input.works ?? [fixtureWork()],
      lines: [fixtureLine()],
      versions: [],
      scheduleBaseline: input.scheduleBaseline ?? null,
    },
    fixtureFact(input.factOverrides),
    input.tasks,
  );
}

describe("buildEstimateV2FinanceProjectSummary (Phase 2 fields)", () => {
  const overdueWork = () => fixtureWork({
    taskId: "task-1",
    plannedStart: isoDaysFromNow(-30),
    plannedEnd: isoDaysFromNow(-5),
  });

  it("exposes contract, cost, margin, and utilization on the cost basis", () => {
    // cost 10 000, markup 10% → taxable base 11 000; margin 1 000.
    const summary = buildFixtureSummary({ factOverrides: { spentCents: 5_000 } });

    expect(summary.contractValueCents).toBe(11_000);
    expect(summary.costCents).toBe(10_000);
    expect(summary.marginCents).toBe(1_000);
    expect(summary.percentUtilization).toBeCloseTo(50, 5);
  });

  it("keeps behind-schedule at zero when the tasks slice is empty (still loading)", () => {
    const summary = buildFixtureSummary({
      works: [overdueWork()],
      scheduleBaseline: OVERDUE_BASELINE,
      tasks: [],
    });

    expect(summary.behindScheduleDays).toBe(0);
  });

  it("keeps behind-schedule at zero without a tasks slice", () => {
    const summary = buildFixtureSummary({
      works: [overdueWork()],
      scheduleBaseline: OVERDUE_BASELINE,
    });

    expect(summary.behindScheduleDays).toBe(0);
  });

  it("reports behind-schedule days past the baseline with unfinished linked tasks", () => {
    const summary = buildFixtureSummary({
      works: [overdueWork()],
      scheduleBaseline: OVERDUE_BASELINE,
      tasks: [{ id: "task-1", status: "in_progress" }] as EstimateV2FinanceTaskSlice[],
    });

    expect(summary.behindScheduleDays).toBeGreaterThan(0);
  });

  it("does not alarm when all linked tasks are done", () => {
    const summary = buildFixtureSummary({
      works: [overdueWork()],
      scheduleBaseline: OVERDUE_BASELINE,
      tasks: [{ id: "task-1", status: "done" }] as EstimateV2FinanceTaskSlice[],
    });

    expect(summary.behindScheduleDays).toBe(0);
  });

  it("derives days-to-end from the current works range, clamped at zero", () => {
    const future = buildFixtureSummary({
      works: [fixtureWork({ plannedStart: isoDaysFromNow(-1), plannedEnd: isoDaysFromNow(14) })],
    });
    expect(future.daysToEnd).toBe(14);

    const past = buildFixtureSummary({
      works: [fixtureWork({ plannedStart: isoDaysFromNow(-20), plannedEnd: isoDaysFromNow(-5) })],
    });
    expect(past.daysToEnd).toBe(0);

    const dateless = buildFixtureSummary({ works: [fixtureWork()] });
    expect(dateless.daysToEnd).toBeNull();
  });
});
