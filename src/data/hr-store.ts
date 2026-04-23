import type {
  EstimateExecutionStatus,
  EstimateV2Project,
  EstimateV2ResourceLine,
} from "@/types/estimate-v2";
import type { HRItemStatus, HRItemType, HRPayment, HRPlannedItem } from "@/types/hr";

interface EstimateV2SyncStateLike {
  project: Pick<EstimateV2Project, "estimateStatus">;
  lines: EstimateV2ResourceLine[];
}

export interface HRStoreMutationResult {
  ok: boolean;
  error?: string;
}

/** HR surface cannot change assignees while the row is driven by the Estimate. */
export const HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE =
  "Assignees for estimate-linked HR work are managed in the Estimate.";

export function isHRAssigneeManagedInEstimate(
  item: Pick<HRPlannedItem, "lockedFromEstimate" | "sourceEstimateV2LineId">,
): boolean {
  const lineId = item.sourceEstimateV2LineId?.trim();
  return Boolean(item.lockedFromEstimate || lineId);
}

type Listener = () => void;

const listeners = new Set<Listener>();
const seedItems: HRPlannedItem[] = [];
const seedPayments: HRPayment[] = [];

let items: HRPlannedItem[] = [...seedItems];
let payments: HRPayment[] = [...seedPayments];

const HR_TYPES = new Set<EstimateV2ResourceLine["type"]>(["labor", "subcontractor"]);

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function qtyFromLine(line: EstimateV2ResourceLine): number {
  return Math.max(0, line.qtyMilli / 1_000);
}

function rateFromLine(line: EstimateV2ResourceLine): number {
  return Math.max(0, line.costUnitCents / 100);
}

function normalizeAssigneeIds(assigneeIds: string[]): string[] {
  const uniq = new Set<string>();
  assigneeIds.forEach((id) => {
    const normalized = id.trim();
    if (!normalized) return;
    uniq.add(normalized);
  });
  return Array.from(uniq);
}

function currentAssigneeIds(item: HRPlannedItem): string[] {
  if (Array.isArray(item.assigneeIds)) return normalizeAssigneeIds(item.assigneeIds);
  if (item.assignee) return [item.assignee];
  return [];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function findLinkedByLineId(projectId: string, lineId: string): HRPlannedItem | null {
  return (
    items.find((item) => item.projectId === projectId && item.sourceEstimateV2LineId === lineId) ?? null
  );
}

function orphanItem(item: HRPlannedItem, reason: "estimate_line_deleted" | "estimate_line_type_changed"): boolean {
  if (item.orphaned && item.orphanedReason === reason && item.sourceEstimateV2LineId == null) return false;
  const now = nowIso();
  items = items.map((entry) => (
    entry.id === item.id
      ? {
        ...entry,
        sourceEstimateV2LineId: null,
        lockedFromEstimate: false,
        orphaned: true,
        orphanedAt: now,
        orphanedReason: reason,
        updatedAt: now,
      }
      : entry
  ));
  return true;
}

function assigneesFromEstimateLine(line: EstimateV2ResourceLine): {
  assignee: string | null;
  assigneeIds: string[];
} {
  const id = line.assigneeId?.trim();
  if (!id) return { assignee: null, assigneeIds: [] };
  const ids = normalizeAssigneeIds([id]);
  return { assignee: ids[0] ?? null, assigneeIds: ids };
}

function applyEstimateLine(itemId: string, line: EstimateV2ResourceLine): boolean {
  const existing = getHRItemById(itemId);
  if (!existing) return false;
  const nextType: HRItemType = line.type === "subcontractor" ? "subcontractor" : "labor";
  const nextQty = qtyFromLine(line);
  const nextRate = rateFromLine(line);
  const { assignee: nextAssignee, assigneeIds: nextAssigneeIds } = assigneesFromEstimateLine(line);
  if (
    existing.stageId === line.stageId
    && existing.workId === line.workId
    && existing.title === line.title
    && existing.type === nextType
    && existing.plannedQty === nextQty
    && existing.plannedRate === nextRate
    && existing.assignee === nextAssignee
    && arraysEqual(currentAssigneeIds(existing), nextAssigneeIds)
    && existing.lockedFromEstimate
    && existing.sourceEstimateV2LineId === line.id
    && !existing.orphaned
  ) {
    return false;
  }

  const now = nowIso();
  items = items.map((item) => (
    item.id === itemId
      ? {
        ...item,
        stageId: line.stageId,
        workId: line.workId,
        title: line.title,
        type: line.type === "subcontractor" ? "subcontractor" : "labor",
        plannedQty: qtyFromLine(line),
        plannedRate: rateFromLine(line),
        assignee: nextAssignee,
        assigneeIds: nextAssigneeIds,
        lockedFromEstimate: true,
        sourceEstimateV2LineId: line.id,
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        updatedAt: now,
      }
      : item
  ));
  return true;
}

export function subscribeHR(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// TODO: cascade delete in DB — the in-memory store is the only surface cleaned up here.
export function removeHRItemsByEstimateV2LineIds(projectId: string, lineIds: string[]): number {
  if (lineIds.length === 0) return 0;
  const toRemove = new Set(lineIds);
  const removedHrItemIds = new Set<string>();
  items.forEach((item) => {
    if (
      item.projectId === projectId
      && item.sourceEstimateV2LineId != null
      && toRemove.has(item.sourceEstimateV2LineId)
    ) {
      removedHrItemIds.add(item.id);
    }
  });
  if (removedHrItemIds.size === 0) return 0;
  items = items.filter((item) => !removedHrItemIds.has(item.id));
  payments = payments.filter((payment) => !removedHrItemIds.has(payment.hrItemId));
  notify();
  return removedHrItemIds.size;
}

export function getHRItems(projectId: string): HRPlannedItem[] {
  return items.filter((item) => item.projectId === projectId);
}

export function getHRItemById(hrItemId: string): HRPlannedItem | undefined {
  return items.find((item) => item.id === hrItemId);
}

export function getAllHRItems(): HRPlannedItem[] {
  return [...items];
}

export function getHRPayments(projectId: string): HRPayment[] {
  return payments.filter((payment) => payment.projectId === projectId);
}

export function getHRPaymentsForItem(hrItemId: string): HRPayment[] {
  return payments.filter((payment) => payment.hrItemId === hrItemId);
}

export function getHRPaidTotal(hrItemId: string): number {
  return getHRPaymentsForItem(hrItemId).reduce((sum, payment) => sum + payment.amount, 0);
}

export function createFromEstimateLine(
  projectId: string,
  lineId: string,
  fields: {
    stageId: string;
    workId: string;
    title: string;
    type: HRItemType;
    plannedQty: number;
    plannedRate: number;
    assignee?: string | null;
  },
  options?: { notify?: boolean },
): HRPlannedItem {
  const now = nowIso();
  const normalizedAssigneeIds = normalizeAssigneeIds(fields.assignee ? [fields.assignee] : []);
  const item: HRPlannedItem = {
    id: genId("hr-item"),
    projectId,
    stageId: fields.stageId,
    workId: fields.workId,
    taskId: null,
    title: fields.title,
    type: fields.type,
    plannedQty: Math.max(0, fields.plannedQty),
    plannedRate: Math.max(0, fields.plannedRate),
    assignee: fields.assignee ?? null,
    assigneeIds: normalizedAssigneeIds,
    status: "planned",
    lockedFromEstimate: true,
    sourceEstimateV2LineId: lineId,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    createdAt: now,
    updatedAt: now,
  };

  items = [...items, item];
  if (options?.notify !== false) notify();
  return item;
}

export function updateFromEstimateLine(
  projectId: string,
  hrItemId: string,
  patch: {
    stageId?: string;
    workId?: string;
    plannedQty?: number;
    plannedRate?: number;
    title?: string;
    assignee?: string | null;
    type?: HRItemType;
    lineId?: string;
  },
): HRPlannedItem | null {
  const existing = getHRItemById(hrItemId);
  if (!existing || existing.projectId !== projectId) return null;

  const now = nowIso();
  const nextAssignee = patch.assignee === undefined ? existing.assignee : patch.assignee;
  const nextAssigneeIds = patch.assignee !== undefined
    ? normalizeAssigneeIds(nextAssignee ? [nextAssignee] : [])
    : currentAssigneeIds(existing);
  const next: HRPlannedItem = {
    ...existing,
    stageId: patch.stageId ?? existing.stageId,
    workId: patch.workId ?? existing.workId,
    title: patch.title ?? existing.title,
    type: patch.type ?? existing.type,
    plannedQty: patch.plannedQty == null ? existing.plannedQty : Math.max(0, patch.plannedQty),
    plannedRate: patch.plannedRate == null ? existing.plannedRate : Math.max(0, patch.plannedRate),
    assignee: nextAssignee,
    assigneeIds: nextAssigneeIds,
    lockedFromEstimate: true,
    sourceEstimateV2LineId: patch.lineId ?? existing.sourceEstimateV2LineId,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    updatedAt: now,
  };

  items = items.map((item) => (item.id === hrItemId ? next : item));
  notify();
  return next;
}

export function setHRAssignees(
  projectId: string,
  hrItemId: string,
  assigneeIds: string[],
): HRStoreMutationResult {
  const existing = getHRItemById(hrItemId);
  if (!existing || existing.projectId !== projectId) {
    return { ok: false, error: "HR item not found" };
  }

  if (isHRAssigneeManagedInEstimate(existing)) {
    return { ok: false, error: HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE };
  }

  const normalized = normalizeAssigneeIds(assigneeIds);
  const prevAssigneeIds = currentAssigneeIds(existing);
  if (arraysEqual(normalized, prevAssigneeIds)) return { ok: true };

  items = items.map((item) => (
    item.id === hrItemId
      ? {
        ...item,
        assignee: normalized[0] ?? null,
        assigneeIds: normalized,
        updatedAt: nowIso(),
      }
      : item
  ));

  notify();
  return { ok: true };
}

export function addPayment(
  hrItemId: string,
  amount: number,
  paidAt: string,
  note?: string,
): HRPayment | null {
  const item = getHRItemById(hrItemId);
  if (!item) return null;

  const payment: HRPayment = {
    id: genId("hr-payment"),
    projectId: item.projectId,
    hrItemId,
    amount: Math.max(0, amount),
    paidAt,
    note: note?.trim() ? note.trim() : null,
    createdAt: nowIso(),
  };

  payments = [...payments, payment];

  notify();
  return payment;
}

export function setStatus(hrItemId: string, status: HRItemStatus): HRStoreMutationResult {
  const existing = getHRItemById(hrItemId);
  if (!existing) return { ok: false, error: "HR item not found" };

  if (
    (status === "in_progress" || status === "done")
    && currentAssigneeIds(existing).length === 0
  ) {
    return { ok: false, error: "Assign at least one person before starting/completing work" };
  }

  if (existing.status === status) return { ok: true };

  items = items.map((item) => (
    item.id === hrItemId
      ? {
        ...item,
        status,
        updatedAt: nowIso(),
      }
      : item
  ));

  notify();
  return { ok: true };
}

export function relinkToEstimateLine(hrItemId: string, newLineId: string): HRStoreMutationResult {
  const existing = getHRItemById(hrItemId);
  if (!existing) return { ok: false, error: "HR item not found" };

  const conflict = items.find((item) => (
    item.projectId === existing.projectId
    && item.id !== hrItemId
    && item.sourceEstimateV2LineId === newLineId
  ));
  if (conflict) {
    return { ok: false, error: "Another HR item is already linked to this estimate line" };
  }

  items = items.map((item) => (
    item.id === hrItemId
      ? {
        ...item,
        sourceEstimateV2LineId: newLineId,
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        updatedAt: nowIso(),
      }
      : item
  ));

  notify();
  return { ok: true };
}

export function syncHRFromEstimateV2(projectId: string, estimateState: EstimateV2SyncStateLike) {
  const nowInWork = (estimateState.project.estimateStatus as EstimateExecutionStatus) === "in_work";
  const lines = estimateState.lines.filter((line) => line.projectId === projectId);
  const linesById = new Map(lines.map((line) => [line.id, line]));
  const hrLines = lines.filter((line) => HR_TYPES.has(line.type));
  let didMutate = false;

  getHRItems(projectId)
    .filter((item) => item.sourceEstimateV2LineId)
    .forEach((item) => {
      const linkedLine = item.sourceEstimateV2LineId ? linesById.get(item.sourceEstimateV2LineId) : null;
      if (!linkedLine) {
        didMutate = orphanItem(item, "estimate_line_deleted") || didMutate;
        return;
      }
      if (!HR_TYPES.has(linkedLine.type)) {
        didMutate = orphanItem(item, "estimate_line_type_changed") || didMutate;
      }
    });

  hrLines.forEach((line) => {
    const existing = findLinkedByLineId(projectId, line.id);
    if (existing) {
      didMutate = applyEstimateLine(existing.id, line) || didMutate;
      return;
    }

    if (!nowInWork) return;

    const { assignee: lineAssignee } = assigneesFromEstimateLine(line);
    createFromEstimateLine(projectId, line.id, {
      stageId: line.stageId,
      workId: line.workId,
      title: line.title,
      type: line.type === "subcontractor" ? "subcontractor" : "labor",
      plannedQty: qtyFromLine(line),
      plannedRate: rateFromLine(line),
      assignee: lineAssignee ?? undefined,
    }, { notify: false });
    didMutate = true;
  });

  if (didMutate) notify();
}

export function __unsafeResetHrForTests() {
  items = [];
  payments = [];
  notify();
}
