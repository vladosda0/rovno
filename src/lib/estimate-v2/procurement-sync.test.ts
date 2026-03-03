import { describe, expect, it } from "vitest";
import {
  addProcurementItem,
  getProcurementItems,
} from "@/data/procurement-store";
import { syncProcurementFromEstimateV2 } from "@/lib/estimate-v2/procurement-sync";
import type { EstimateV2ResourceLine } from "@/types/estimate-v2";

function line(partial: Partial<EstimateV2ResourceLine>): EstimateV2ResourceLine {
  return {
    id: partial.id ?? "line-1",
    projectId: partial.projectId ?? "project-1",
    stageId: partial.stageId ?? "stage-1",
    workId: partial.workId ?? "work-1",
    title: partial.title ?? "Cement",
    type: partial.type ?? "material",
    unit: partial.unit ?? "bag",
    qtyMilli: partial.qtyMilli ?? 3_000,
    costUnitCents: partial.costUnitCents ?? 2_500,
    markupBps: 0,
    discountBpsOverride: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("estimate-v2 procurement sync", () => {
  it("creates locked linked procurement items when in_work", () => {
    const projectId = `proc-sync-create-${Date.now()}`;

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: `line-${Date.now()}`, projectId, type: "material", qtyMilli: 2_500, costUnitCents: 1_230 })],
    });

    const created = getProcurementItems(projectId);
    expect(created.length).toBe(1);
    expect(created[0].lockedFromEstimate).toBe(true);
    expect(created[0].sourceEstimateV2LineId).toBeTruthy();
    expect(created[0].requiredQty).toBe(2.5);
    expect(created[0].plannedUnitPrice).toBe(12.3);
  });

  it("updates linked locked planned fields from estimate edits", () => {
    const projectId = `proc-sync-update-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, title: "Primer", type: "material", qtyMilli: 1_000, costUnitCents: 1_000 })],
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, title: "Primer updated", type: "material", qtyMilli: 3_000, costUnitCents: 1_500 })],
    });

    const updated = getProcurementItems(projectId).find((item) => item.sourceEstimateV2LineId === lineId);
    expect(updated?.name).toBe("Primer updated");
    expect(updated?.requiredQty).toBe(3);
    expect(updated?.plannedUnitPrice).toBe(15);
    expect(updated?.lockedFromEstimate).toBe(true);
  });

  it("marks orphan on estimate line delete", () => {
    const projectId = `proc-sync-delete-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "material" })],
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [],
    });

    const orphaned = getProcurementItems(projectId, true)[0];
    expect(orphaned.orphaned).toBe(true);
    expect(orphaned.orphanedReason).toBe("estimate_line_deleted");
    expect(orphaned.sourceEstimateV2LineId).toBeNull();
  });

  it("does not orphan on intra-family change, but orphans on cross-family change", () => {
    const projectId = `proc-sync-type-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "material" })],
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "tool" })],
    });

    const stillLinked = getProcurementItems(projectId, true)[0];
    expect(stillLinked.orphaned).toBe(false);
    expect(stillLinked.type).toBe("tool");

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "labor" })],
    });

    const orphaned = getProcurementItems(projectId, true)[0];
    expect(orphaned.orphaned).toBe(true);
    expect(orphaned.orphanedReason).toBe("estimate_line_type_changed");
  });

  it("backfills estimate-created items by matching key", () => {
    const projectId = `proc-sync-backfill-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    const existing = addProcurementItem({
      id: `proc-${Date.now()}`,
      projectId,
      stageId: "stage-1",
      categoryId: null,
      type: "material",
      name: "Backfill line",
      spec: null,
      unit: "pcs",
      requiredByDate: null,
      requiredQty: 1,
      orderedQty: 0,
      receivedQty: 0,
      plannedUnitPrice: 10,
      actualUnitPrice: null,
      supplier: null,
      supplierPreferred: null,
      locationPreferredId: null,
      lockedFromEstimate: false,
      sourceEstimateItemId: null,
      sourceEstimateV2LineId: null,
      orphaned: false,
      orphanedAt: null,
      orphanedReason: null,
      linkUrl: null,
      notes: null,
      attachments: [],
      createdFrom: "estimate",
      linkedTaskIds: [],
      archived: false,
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, stageId: "stage-1", title: "Backfill line", unit: "pcs", type: "material" })],
    });

    const projectItems = getProcurementItems(projectId, true);
    expect(projectItems.length).toBe(1);
    expect(projectItems[0].id).toBe(existing.id);
    expect(projectItems[0].sourceEstimateV2LineId).toBe(lineId);
  });
});
