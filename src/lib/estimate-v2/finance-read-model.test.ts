import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __unsafeResetStoreForTests,
  addMember,
  addProject,
  getEstimate,
  getProjects,
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
  applySensitiveDetailToEstimateV2FinanceSnapshot,
  getEstimateV2FinanceProjectSummary,
  getEstimateV2FinanceSnapshot,
} from "@/lib/estimate-v2/finance-read-model";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import { computeFactFromProcurementAndHR } from "@/lib/estimate-v2/rollups";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

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
    const snapshot = getEstimateV2FinanceSnapshot(getProjects());

    expect(summary).not.toBeNull();
    expect(summary?.hasEstimate).toBe(false);
    expect(summary?.plannedBudgetCents).toBe(0);
    expect(summary?.spentCents).toBe(0);
    expect(snapshot.projects.find((project) => project.projectId === "project-empty-finance")?.hasEstimate).toBe(false);
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
      receivedCents: 9_000_000,
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

  it("applySensitiveDetailToEstimateV2FinanceSnapshot clears totals when no project may view detail", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Sensitive line",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 50_000,
    });

    const snap = getEstimateV2FinanceSnapshot(getProjects());
    expect(snap.totals.plannedBudgetCents).toBeGreaterThan(0);

    const redacted = applySensitiveDetailToEstimateV2FinanceSnapshot(snap, () => false);
    expect(redacted.totals.plannedBudgetCents).toBe(0);
    expect(redacted.totals.spentCents).toBe(0);
    expect(redacted.projects.every((p) => p.sensitiveFinanceVisible === false)).toBe(true);
    expect(redacted.projects[0]?.plannedBudgetCents).toBe(0);

    const restored = applySensitiveDetailToEstimateV2FinanceSnapshot(snap, () => true);
    expect(restored.totals.plannedBudgetCents).toBe(snap.totals.plannedBudgetCents);
    expect(restored.projects.every((p) => p.sensitiveFinanceVisible === true)).toBe(true);
  });
});
