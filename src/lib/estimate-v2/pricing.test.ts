import { describe, expect, it } from "vitest";
import type {
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  Regime,
  ResourceLineType,
} from "@/types/estimate-v2";
import {
  computeEffectiveDiscountBps,
  computeLineTotals,
  computeProjectTotals,
  computeClientUnitCents,
} from "@/lib/estimate-v2/pricing";

function createProject(partial: Partial<EstimateV2Project> = {}): EstimateV2Project {
  return {
    id: "estimate-1",
    projectId: "project-1",
    title: "Project",
    currency: "RUB",
    regime: "contractor",
    taxBps: 2000,
    discountBps: 500,
    markupBps: 2000,
    estimateStatus: "planning",
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function createStage(partial: Partial<EstimateV2Stage> = {}): EstimateV2Stage {
  return {
    id: "stage-1",
    projectId: "project-1",
    title: "Stage",
    order: 1,
    discountBps: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function createLine(partial: Partial<EstimateV2ResourceLine> = {}): EstimateV2ResourceLine {
  return {
    id: "line-1",
    projectId: "project-1",
    stageId: "stage-1",
    workId: "work-1",
    title: "Line",
    type: "material",
    unit: "pcs",
    qtyMilli: 1_000,
    costUnitCents: 10_000,
    markupBps: 2000,
    discountBpsOverride: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("estimate-v2 pricing", () => {
  it("applies stage discount cascade when line override is absent", () => {
    const project = createProject({ discountBps: 300 });
    const stage = createStage({ discountBps: 1200 });
    const line = createLine({ discountBpsOverride: null });

    expect(computeEffectiveDiscountBps(line, stage, project)).toBe(1200);
  });

  it("prefers line discount override over stage and project discounts", () => {
    const project = createProject({ discountBps: 300 });
    const stage = createStage({ discountBps: 1200 });
    const line = createLine({ discountBpsOverride: 2500 });

    expect(computeEffectiveDiscountBps(line, stage, project)).toBe(2500);
  });

  it("applies markup to labor and subcontractor lines in contractor mode", () => {
    const project = createProject();
    const stage = createStage();
    const labor = createLine({ id: "line-labor", type: "labor" });
    const subcontractor = createLine({ id: "line-sub", type: "subcontractor" });

    const laborTotals = computeLineTotals(labor, stage, project, "contractor");
    const subTotals = computeLineTotals(subcontractor, stage, project, "contractor");

    expect(laborTotals.clientUnitCents).toBeGreaterThan(labor.costUnitCents);
    expect(subTotals.clientUnitCents).toBeGreaterThan(subcontractor.costUnitCents);
  });

  it("forces markup to zero in build_myself regime", () => {
    const project = createProject();
    const stage = createStage();
    const line = createLine({ markupBps: 4000, discountBpsOverride: 0 });

    const totals = computeLineTotals(line, stage, project, "build_myself");

    expect(totals.clientUnitCents).toBe(line.costUnitCents);
    expect(totals.markupCents).toBe(0);
  });

  it("computes tax and total deterministically", () => {
    const project = createProject({ taxBps: 1000 });
    const stage = createStage();
    const lines = [
      createLine({ id: "l1", type: "material" as ResourceLineType, costUnitCents: 10_000, qtyMilli: 1_000, markupBps: 0, discountBpsOverride: 0 }),
      createLine({ id: "l2", type: "labor" as ResourceLineType, costUnitCents: 5_000, qtyMilli: 2_000, markupBps: 0, discountBpsOverride: 0 }),
    ];

    const totals = computeProjectTotals(project, [stage], [], lines, "contractor");

    expect(totals.subtotalCents).toBe(20_000);
    expect(totals.taxAmountCents).toBe(2_000);
    expect(totals.totalCents).toBe(22_000);
  });

  it("uses half-up rounding for edge values", () => {
    const unit = computeClientUnitCents(1, 5000, 0); // 1.5 => 2 with half-up
    expect(unit).toBe(2);

    const project = createProject({ taxBps: 5000 });
    const stage = createStage();
    const line = createLine({ costUnitCents: 1, qtyMilli: 1_000, markupBps: 0, discountBpsOverride: 0 });
    const totals = computeLineTotals(line, stage, project, "contractor" as Regime);

    expect(totals.clientTotalCents).toBe(1);
  });
});
