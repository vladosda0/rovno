import { describe, expect, it } from "vitest";
import {
  buildLocalPortfolioSnapshot,
  computeRiskFlags,
  mapPortfolioSnapshotFromRpc,
} from "@/lib/finance/portfolio-read-model";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";

function summary(overrides: Partial<EstimateV2FinanceProjectSummary> = {}): EstimateV2FinanceProjectSummary {
  return {
    projectId: "p1",
    projectTitle: "Project 1",
    currency: "RUB",
    hasEstimate: true,
    status: "in_work",
    stageCount: 1,
    workCount: 1,
    lineCount: 1,
    plannedBudgetCents: 1_000_000,
    spentCents: 600_000,
    toBePaidCents: 100_000,
    varianceCents: 400_000,
    percentSpent: 60,
    percentProfitability: 20,
    contractValueCents: 1_250_000,
    costCents: 1_000_000,
    marginCents: 250_000,
    percentUtilization: 60,
    tasksDone: 2,
    tasksTotal: 10,
    percentComplete: 20,
    daysToEnd: 5,
    behindScheduleDays: 0,
    ...overrides,
  };
}

describe("computeRiskFlags", () => {
  it("flags overspend by amount (spent > cost)", () => {
    const flags = computeRiskFlags({
      spentCents: 1_200_000, costCents: 1_000_000, percentSpent: 120,
      percentComplete: 90, marginPct: 20, scheduleBehindDays: 0,
    });
    expect(flags).toContain("overspend");
  });

  it("flags overspend by pace (spent% − complete% >= 20)", () => {
    const flags = computeRiskFlags({
      spentCents: 600_000, costCents: 1_000_000, percentSpent: 56,
      percentComplete: 18, marginPct: 30, scheduleBehindDays: 0,
    });
    expect(flags).toEqual(["overspend"]);
  });

  it("flags behind and thin_margin", () => {
    const flags = computeRiskFlags({
      spentCents: 0, costCents: 1_000_000, percentSpent: 0,
      percentComplete: 0, marginPct: 4, scheduleBehindDays: 12,
    });
    expect(flags).toEqual(["behind", "thin_margin"]);
  });

  it("is clean for a healthy project", () => {
    const flags = computeRiskFlags({
      spentCents: 100_000, costCents: 1_000_000, percentSpent: 10,
      percentComplete: 12, marginPct: 25, scheduleBehindDays: 0,
    });
    expect(flags).toEqual([]);
  });

  it("does not flag overspend when cost is zero but nothing was spent", () => {
    const flags = computeRiskFlags({
      spentCents: 0, costCents: 0, percentSpent: null,
      percentComplete: null, marginPct: null, scheduleBehindDays: 0,
    });
    expect(flags).toEqual([]);
  });
});

describe("buildLocalPortfolioSnapshot", () => {
  it("maps detail-visible summaries with margin, flags, totals, and pipeline", () => {
    const snap = buildLocalPortfolioSnapshot(
      [summary({ projectId: "p1", percentSpent: 56, percentComplete: 18 })],
      () => true,
    );

    expect(snap.projects).toHaveLength(1);
    const row = snap.projects[0];
    expect(row.financeVisibility).toBe("detail");
    expect(row.marginPct).toBeCloseTo(20, 1);
    expect(row.riskFlags).toContain("overspend"); // 56% spent at 18% done
    expect(snap.totals.contractValueCents).toBe(1_250_000);
    expect(snap.totals.marginPct).toBeCloseTo(20, 1);
    expect(snap.totals.activeCount).toBe(1);
    expect(snap.totals.atRiskCount).toBe(1);
    expect(snap.totals.redactedProjectCount).toBe(0);
    expect(snap.pipeline.inWork.count).toBe(1);
    // backlog = contract × (1 − complete/100) = 1 250 000 × 0.82
    expect(snap.pipeline.inWork.backlogCents).toBe(Math.round(1_250_000 * 0.82));
  });

  it("redacts money and excludes from totals when the viewer lacks detail", () => {
    const snap = buildLocalPortfolioSnapshot([summary({ projectId: "p1" })], () => false);
    const row = snap.projects[0];
    expect(row.financeVisibility).toBe("none");
    expect(row.contractValueCents).toBeNull();
    expect(row.marginCents).toBeNull();
    expect(row.riskFlags).toEqual([]);
    expect(snap.totals.contractValueCents).toBe(0);
    expect(snap.totals.redactedProjectCount).toBe(1);
    // Status counting still happens for redacted rows.
    expect(snap.totals.activeCount).toBe(1);
  });

  it("buckets paused projects under in_work and counts finished separately", () => {
    const snap = buildLocalPortfolioSnapshot(
      [
        summary({ projectId: "a", status: "planning" }),
        summary({ projectId: "b", status: "in_work" }),
        summary({ projectId: "c", status: "paused" }),
        summary({ projectId: "d", status: "finished" }),
      ],
      () => true,
    );
    expect(snap.pipeline.planning.count).toBe(1);
    expect(snap.pipeline.inWork.count).toBe(2); // in_work + paused
    expect(snap.pipeline.finished.count).toBe(1);
    expect(snap.totals.activeCount).toBe(3); // all but finished
  });
});

describe("mapPortfolioSnapshotFromRpc", () => {
  it("parses the snake_case jsonb into the camel-case snapshot", () => {
    const payload = {
      projects: [{
        project_id: "p1", title: "Берёзки-1", status: "in_work",
        finance_visibility: "detail", has_estimate: true,
        contract_value_cents: 464_947_480, cost_cents: 437_692_000,
        margin_cents: 27_255_480, margin_pct: 5.9, spent_cents: 247_130_000,
        percent_spent: 56.5, to_be_paid_cents: 362_002_000,
        tasks_done: 1, tasks_total: 18, percent_complete: 5.6,
        planned_start: null, planned_end: null, schedule_behind_days: 0,
        risk_flags: ["overspend", "thin_margin"],
      }],
      totals: {
        contract_value_cents: 464_947_480, cost_cents: 437_692_000,
        margin_cents: 27_255_480, margin_pct: 5.9, spent_cents: 247_130_000,
        to_be_paid_cents: 362_002_000, active_count: 1, at_risk_count: 1,
        avg_percent_complete: 5.6, redacted_project_count: 0,
      },
      pipeline: {
        planning: { count: 0, contract_value_cents: 0 },
        in_work: { count: 1, contract_value_cents: 464_947_480, backlog_cents: 438_910_000 },
        finished: { count: 0, contract_value_cents: 0 },
      },
    };

    const snap = mapPortfolioSnapshotFromRpc(payload);
    expect(snap.projects[0].title).toBe("Берёзки-1");
    expect(snap.projects[0].contractValueCents).toBe(464_947_480);
    expect(snap.projects[0].riskFlags).toEqual(["overspend", "thin_margin"]);
    expect(snap.totals.marginPct).toBe(5.9);
    expect(snap.pipeline.inWork.backlogCents).toBe(438_910_000);
  });

  it("redacted rows carry null money and survive parsing", () => {
    const snap = mapPortfolioSnapshotFromRpc({
      projects: [{
        project_id: "p2", title: "Hidden", status: "planning",
        finance_visibility: "none", has_estimate: true,
        contract_value_cents: null, cost_cents: null, margin_cents: null,
        margin_pct: null, spent_cents: null, percent_spent: null,
        to_be_paid_cents: null, tasks_done: 0, tasks_total: 0,
        percent_complete: null, planned_start: null, planned_end: null,
        schedule_behind_days: 0, risk_flags: [],
      }],
      totals: {}, pipeline: {},
    });
    expect(snap.projects[0].contractValueCents).toBeNull();
    expect(snap.projects[0].financeVisibility).toBe("none");
    expect(snap.pipeline.planning.count).toBe(0);
  });

  it("tolerates an empty / malformed payload", () => {
    const snap = mapPortfolioSnapshotFromRpc(null);
    expect(snap.projects).toEqual([]);
    expect(snap.totals.contractValueCents).toBe(0);
    expect(snap.pipeline.inWork.count).toBe(0);
  });
});
