import {
  addProcurementItem,
  getProcurementItemById,
  getProcurementItems,
  updateProcurementItem,
} from "@/data/procurement-store";
import { matchingKey } from "@/lib/procurement-utils";
import type { ProcurementItemV2 } from "@/types/entities";
import type {
  EstimateExecutionStatus,
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Work,
} from "@/types/estimate-v2";

export type ProcurementSyncReason = "estimate_line_deleted" | "estimate_line_type_changed";

interface EstimateV2SyncStateLike {
  project: Pick<EstimateV2Project, "estimateStatus">;
  lines: EstimateV2ResourceLine[];
  works: Pick<EstimateV2Work, "id" | "plannedStart">[];
}

const PROCUREMENT_TYPES = new Set<EstimateV2ResourceLine["type"]>(["material", "tool"]);

function nowIso(): string {
  return new Date().toISOString();
}

function qtyFromLine(line: EstimateV2ResourceLine): number {
  return Math.max(0, line.qtyMilli / 1_000);
}

function plannedUnitPriceFromLine(line: EstimateV2ResourceLine): number {
  return Math.max(0, line.costUnitCents / 100);
}

function requiredByDateFromWorkStart(
  line: EstimateV2ResourceLine,
  workStartByWorkId: Map<string, string | null>,
): string | null {
  return workStartByWorkId.get(line.workId) ?? null;
}

function isEstimateV2Linked(
  item: ProcurementItemV2,
  knownLineIds: Set<string>,
): { linked: boolean; lineId: string | null } {
  if (item.sourceEstimateV2LineId) {
    return { linked: true, lineId: item.sourceEstimateV2LineId };
  }

  if (item.sourceEstimateItemId && knownLineIds.has(item.sourceEstimateItemId)) {
    return { linked: true, lineId: item.sourceEstimateItemId };
  }

  return { linked: false, lineId: null };
}

function applyEstimateLineToProcurementItem(
  itemId: string,
  line: EstimateV2ResourceLine,
  workStartByWorkId: Map<string, string | null>,
) {
  updateProcurementItem(itemId, {
    stageId: line.stageId,
    type: line.type === "tool" ? "tool" : "material",
    name: line.title,
    unit: line.unit,
    requiredByDate: requiredByDateFromWorkStart(line, workStartByWorkId),
    requiredQty: qtyFromLine(line),
    plannedUnitPrice: plannedUnitPriceFromLine(line),
    lockedFromEstimate: true,
    sourceEstimateV2LineId: line.id,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
  });
}

function orphanProcurementItem(item: ProcurementItemV2, reason: ProcurementSyncReason) {
  updateProcurementItem(item.id, {
    sourceEstimateV2LineId: null,
    sourceEstimateItemId: null,
    orphaned: true,
    orphanedAt: nowIso(),
    orphanedReason: reason,
  });
}

function findBackfillCandidate(
  line: EstimateV2ResourceLine,
  items: ProcurementItemV2[],
  claimedItemIds: Set<string>,
): ProcurementItemV2 | null {
  const lineKey = matchingKey(line.title, null, line.unit, line.stageId);
  return (
    items.find((item) => {
      if (claimedItemIds.has(item.id)) return false;
      if (item.archived) return false;
      if (item.createdFrom !== "estimate") return false;
      if (item.orphaned) return false;
      if (item.sourceEstimateV2LineId) return false;
      if (item.sourceEstimateItemId) return false;
      const itemKey = matchingKey(item.name, item.spec, item.unit, item.stageId);
      return itemKey === lineKey;
    }) ?? null
  );
}

function createFromLine(
  projectId: string,
  line: EstimateV2ResourceLine,
  workStartByWorkId: Map<string, string | null>,
) {
  addProcurementItem({
    projectId,
    stageId: line.stageId,
    categoryId: null,
    type: line.type === "tool" ? "tool" : "material",
    name: line.title,
    spec: null,
    unit: line.unit,
    requiredByDate: requiredByDateFromWorkStart(line, workStartByWorkId),
    requiredQty: qtyFromLine(line),
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: plannedUnitPriceFromLine(line),
    actualUnitPrice: null,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: true,
    sourceEstimateItemId: null,
    sourceEstimateV2LineId: line.id,
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
}

function relinkProcurementItem(
  itemId: string,
  line: EstimateV2ResourceLine,
  workStartByWorkId: Map<string, string | null>,
): boolean {
  const existing = getProcurementItemById(itemId);
  if (!existing || existing.projectId !== line.projectId) return false;

  applyEstimateLineToProcurementItem(itemId, line, workStartByWorkId);
  return true;
}

export function relinkProcurementItemToEstimateV2Line(
  projectId: string,
  itemId: string,
  lineId: string,
  estimateState: EstimateV2SyncStateLike,
): boolean {
  const line = estimateState.lines.find((entry) => entry.id === lineId && entry.projectId === projectId);
  if (!line) return false;
  if (!PROCUREMENT_TYPES.has(line.type)) return false;
  const workStartByWorkId = new Map(
    estimateState.works.map((work) => [work.id, work.plannedStart ?? null]),
  );
  return relinkProcurementItem(itemId, line, workStartByWorkId);
}

export function syncProcurementFromEstimateV2(
  projectId: string,
  estimateState: EstimateV2SyncStateLike,
) {
  const nowInWork = (estimateState.project.estimateStatus as EstimateExecutionStatus) === "in_work";
  const lines = estimateState.lines.filter((line) => line.projectId === projectId);
  const allLineIds = new Set(lines.map((line) => line.id));
  const linesById = new Map(lines.map((line) => [line.id, line]));
  const procurementLines = lines.filter((line) => PROCUREMENT_TYPES.has(line.type));
  const workStartByWorkId = new Map(
    estimateState.works.map((work) => [work.id, work.plannedStart ?? null]),
  );

  const items = getProcurementItems(projectId, true);
  const claimedItemIds = new Set<string>();

  const byLinkedLineId = new Map<string, ProcurementItemV2>();
  items.forEach((item) => {
    const linked = isEstimateV2Linked(item, allLineIds);
    if (!linked.linked || !linked.lineId) return;

    if (!item.sourceEstimateV2LineId) {
      updateProcurementItem(item.id, {
        sourceEstimateV2LineId: linked.lineId,
        sourceEstimateItemId: null,
      });
    }

    byLinkedLineId.set(linked.lineId, item);
    claimedItemIds.add(item.id);

    const line = linesById.get(linked.lineId);
    if (!line) {
      orphanProcurementItem(item, "estimate_line_deleted");
      return;
    }

    if (!PROCUREMENT_TYPES.has(line.type)) {
      orphanProcurementItem(item, "estimate_line_type_changed");
    }
  });

  procurementLines.forEach((line) => {
    let existing = byLinkedLineId.get(line.id) ?? null;

    if (!existing) {
      const backfill = findBackfillCandidate(line, items, claimedItemIds);
      if (backfill) {
        updateProcurementItem(backfill.id, {
          sourceEstimateV2LineId: line.id,
          sourceEstimateItemId: null,
          orphaned: false,
          orphanedAt: null,
          orphanedReason: null,
          lockedFromEstimate: true,
        });
        existing = backfill;
        byLinkedLineId.set(line.id, backfill);
        claimedItemIds.add(backfill.id);
      }
    }

    if (existing) {
      applyEstimateLineToProcurementItem(existing.id, line, workStartByWorkId);
      return;
    }

    if (nowInWork) {
      createFromLine(projectId, line, workStartByWorkId);
    }
  });
}
