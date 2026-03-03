import { beforeEach, describe, expect, it } from "vitest";
import {
  __unsafeResetHrForTests,
  addPayment,
  createFromEstimateLine,
  getHRItems,
  relinkToEstimateLine,
  setStatus,
  syncHRFromEstimateV2,
  updateFromEstimateLine,
} from "@/data/hr-store";
import type { EstimateV2ResourceLine } from "@/types/estimate-v2";

function line(partial: Partial<EstimateV2ResourceLine>): EstimateV2ResourceLine {
  return {
    id: partial.id ?? "line-1",
    projectId: partial.projectId ?? "project-1",
    stageId: partial.stageId ?? "stage-1",
    workId: partial.workId ?? "work-1",
    title: partial.title ?? "Painter",
    type: partial.type ?? "labor",
    unit: partial.unit ?? "hour",
    qtyMilli: partial.qtyMilli ?? 10_000,
    costUnitCents: partial.costUnitCents ?? 2_000,
    markupBps: 0,
    discountBpsOverride: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("hr-store", () => {
  beforeEach(() => {
    __unsafeResetHrForTests();
  });

  it("creates and updates estimate-linked HR items", () => {
    const projectId = `hr-create-${Date.now()}`;
    const created = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Electrician",
      type: "labor",
      plannedQty: 8,
      plannedRate: 100,
    });

    expect(created.lockedFromEstimate).toBe(true);
    expect(created.sourceEstimateV2LineId).toBe("line-1");

    updateFromEstimateLine(projectId, created.id, {
      title: "Electrician lead",
      plannedQty: 12,
      plannedRate: 150,
      type: "subcontractor",
      lineId: "line-1",
    });

    const updated = getHRItems(projectId)[0];
    expect(updated.title).toBe("Electrician lead");
    expect(updated.plannedQty).toBe(12);
    expect(updated.plannedRate).toBe(150);
    expect(updated.type).toBe("subcontractor");
    expect(updated.lockedFromEstimate).toBe(true);
  });

  it("tracks payments and supports status updates", () => {
    const projectId = `hr-pay-${Date.now()}`;
    const created = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Crew",
      type: "labor",
      plannedQty: 2,
      plannedRate: 100,
    });

    setStatus(created.id, "requested");
    addPayment(created.id, 50, "2026-01-01T00:00:00.000Z");

    const afterFirst = getHRItems(projectId)[0];
    expect(afterFirst.status).toBe("requested");

    addPayment(created.id, 200, "2026-01-02T00:00:00.000Z");
    const afterSecond = getHRItems(projectId)[0];
    expect(afterSecond.status).toBe("paid");
  });

  it("applies orphan policy for delete/cross-family and keeps intra-family linkage", () => {
    const projectId = `hr-orphan-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "labor" })],
    });

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "subcontractor" })],
    });

    const intraFamily = getHRItems(projectId)[0];
    expect(intraFamily.orphaned).toBe(false);
    expect(intraFamily.type).toBe("subcontractor");

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "material" })],
    });

    const crossFamily = getHRItems(projectId)[0];
    expect(crossFamily.orphaned).toBe(true);
    expect(crossFamily.orphanedReason).toBe("estimate_line_type_changed");
    expect(crossFamily.sourceEstimateV2LineId).toBeNull();

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [],
    });

    const deleted = getHRItems(projectId)[0];
    expect(deleted.orphaned).toBe(true);
  });

  it("relinks orphaned items", () => {
    const projectId = `hr-relink-${Date.now()}`;
    const created = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Crew",
      type: "labor",
      plannedQty: 1,
      plannedRate: 100,
    });

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [],
    });

    const orphaned = getHRItems(projectId)[0];
    expect(orphaned.orphaned).toBe(true);

    relinkToEstimateLine(created.id, "line-2");
    const relinked = getHRItems(projectId)[0];
    expect(relinked.orphaned).toBe(false);
    expect(relinked.sourceEstimateV2LineId).toBe("line-2");
  });
});
