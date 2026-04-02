import { describe, expect, it } from "vitest";
import {
  addProcurementItem,
  getProcurementItems,
} from "@/data/procurement-store";
import { syncProcurementFromEstimateV2 } from "@/lib/estimate-v2/procurement-sync";
import type { EstimateV2ResourceLine, EstimateV2Work } from "@/types/estimate-v2";

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
    assigneeId: null,
    assigneeName: null,
    assigneeEmail: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function work(partial: Partial<EstimateV2Work> = {}): Pick<EstimateV2Work, "id" | "plannedStart" | "stageId"> {
  return {
    id: partial.id ?? "work-1",
    plannedStart: partial.plannedStart ?? null,
    stageId: partial.stageId ?? "stage-1",
  };
}

describe("estimate-v2 procurement sync", () => {
  it("creates locked linked procurement items when in_work", () => {
    const projectId = `proc-sync-create-${Date.now()}`;
    const workId = `work-${Date.now()}`;
    const plannedStart = "2026-04-10T00:00:00.000Z";

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: `line-${Date.now()}`, projectId, workId, type: "material", qtyMilli: 2_500, costUnitCents: 1_230 })],
      works: [work({ id: workId, plannedStart })],
    });

    const created = getProcurementItems(projectId);
    expect(created.length).toBe(1);
    expect(created[0].lockedFromEstimate).toBe(true);
    expect(created[0].sourceEstimateV2LineId).toBeTruthy();
    expect(created[0].requiredQty).toBe(2.5);
    expect(created[0].plannedUnitPrice).toBe(12.3);
    expect(created[0].requiredByDate).toBe(plannedStart);
  });

  it("updates linked locked planned fields and requiredByDate from estimate edits", () => {
    const projectId = `proc-sync-update-${Date.now()}`;
    const lineId = `line-${Date.now()}`;
    const workId = `work-${Date.now()}`;
    const firstStart = "2026-04-10T00:00:00.000Z";
    const nextStart = "2026-04-14T00:00:00.000Z";

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, workId, title: "Primer", type: "material", qtyMilli: 1_000, costUnitCents: 1_000 })],
      works: [work({ id: workId, plannedStart: firstStart })],
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, workId, title: "Primer updated", type: "material", qtyMilli: 3_000, costUnitCents: 1_500 })],
      works: [work({ id: workId, plannedStart: nextStart })],
    });

    const updated = getProcurementItems(projectId).find((item) => item.sourceEstimateV2LineId === lineId);
    expect(updated?.name).toBe("Primer updated");
    expect(updated?.requiredQty).toBe(3);
    expect(updated?.plannedUnitPrice).toBe(15);
    expect(updated?.lockedFromEstimate).toBe(true);
    expect(updated?.requiredByDate).toBe(nextStart);
  });

  it("falls back requiredByDate to stage start when work plannedStart is missing", () => {
    const projectId = `proc-sync-stage-fallback-${Date.now()}`;
    const workIdMissingStart = `work-${Date.now()}-a`;
    const workIdWithStart = `work-${Date.now()}-b`;
    const stageId = "stage-1";
    const stageStart = "2026-04-10T00:00:00.000Z";

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [
        line({
          id: `line-${Date.now()}`,
          projectId,
          workId: workIdMissingStart,
          stageId,
          type: "material",
          qtyMilli: 2_500,
          costUnitCents: 1_230,
        }),
      ],
      works: [
        work({ id: workIdMissingStart, stageId, plannedStart: null }),
        work({ id: workIdWithStart, stageId, plannedStart: stageStart }),
      ],
    });

    const created = getProcurementItems(projectId)[0];
    expect(created.requiredByDate).toBe(stageStart);
  });

  it("falls back procurement stageId to linked work stageId when line stageId is empty", () => {
    const projectId = `proc-sync-stage-id-fallback-${Date.now()}`;
    const workId = `work-${Date.now()}`;
    const stageId = "stage-1";
    const plannedStart = "2026-04-10T00:00:00.000Z";

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [
        line({
          id: `line-${Date.now()}`,
          projectId,
          workId,
          stageId: "",
          type: "material",
          qtyMilli: 2_500,
          costUnitCents: 1_230,
        }),
      ],
      works: [work({ id: workId, stageId, plannedStart })],
    });

    const created = getProcurementItems(projectId)[0];
    expect(created.stageId).toBe(stageId);
    expect(created.requiredByDate).toBe(plannedStart);
  });

  it("marks orphan on estimate line delete", () => {
    const projectId = `proc-sync-delete-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "material" })],
      works: [],
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [],
      works: [],
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
      works: [],
    });

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "tool" })],
      works: [],
    });

    const stillLinked = getProcurementItems(projectId, true)[0];
    expect(stillLinked.orphaned).toBe(false);
    expect(stillLinked.type).toBe("tool");

    syncProcurementFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "labor" })],
      works: [],
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
      works: [],
    });

    const projectItems = getProcurementItems(projectId, true);
    expect(projectItems.length).toBe(1);
    expect(projectItems[0].id).toBe(existing.id);
    expect(projectItems[0].sourceEstimateV2LineId).toBe(lineId);
  });

  it("does not treat legacy estimate item ids as active procurement linkage", () => {
    const projectId = `proc-sync-legacy-ignore-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    addProcurementItem({
      id: `proc-legacy-${Date.now()}`,
      projectId,
      stageId: "stage-1",
      categoryId: null,
      type: "material",
      name: "Legacy-only row",
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
      sourceEstimateItemId: lineId,
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
      lines: [line({ id: lineId, projectId, stageId: "stage-1", title: "Fresh linked line", unit: "pcs", type: "material" })],
      works: [],
    });

    const projectItems = getProcurementItems(projectId, true);
    expect(projectItems).toHaveLength(2);
    expect(projectItems.find((item) => item.name === "Legacy-only row")?.sourceEstimateV2LineId).toBeNull();
    expect(projectItems.find((item) => item.sourceEstimateV2LineId === lineId)?.name).toBe("Fresh linked line");
  });
});
