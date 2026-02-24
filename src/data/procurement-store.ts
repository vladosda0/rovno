import type { ProcurementItemV2, ChecklistItem } from "@/types/entities";
import { matchingKey, normalizeName, computeStatus } from "@/lib/procurement-utils";
import type { StageEstimateItem } from "@/data/estimate-store";

// --- Seed data migrated from old format ---
const seedItems: ProcurementItemV2[] = [
  {
    id: "proc-1-1", projectId: "project-1", stageId: "stage-1-2", categoryId: null,
    name: "Electrical cable NYM 3×2.5", spec: "NYM 3×2.5", unit: "m",
    requiredQty: 200, orderedQty: 200, receivedQty: 200,
    plannedUnitPrice: 40, actualUnitPrice: 40,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-1-3"], archived: false,
    createdAt: "2025-01-20T10:00:00Z", updatedAt: "2025-01-20T10:00:00Z",
  },
  {
    id: "proc-1-2", projectId: "project-1", stageId: "stage-1-2", categoryId: null,
    name: "PPR pipes 20mm", spec: "20mm", unit: "m",
    requiredQty: 50, orderedQty: 0, receivedQty: 0,
    plannedUnitPrice: 100, actualUnitPrice: null,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-1-4"], archived: false,
    createdAt: "2025-01-20T10:30:00Z", updatedAt: "2025-01-20T10:30:00Z",
  },
  {
    id: "proc-1-3", projectId: "project-1", stageId: "stage-1-3", categoryId: null,
    name: "Gypsum drywall 12.5mm", spec: "12.5mm", unit: "pcs",
    requiredQty: 40, orderedQty: 0, receivedQty: 0,
    plannedUnitPrice: 600, actualUnitPrice: null,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-1-5"], archived: false,
    createdAt: "2025-01-25T08:00:00Z", updatedAt: "2025-01-25T08:00:00Z",
  },
  {
    id: "proc-1-4", projectId: "project-1", stageId: "stage-1-3", categoryId: null,
    name: "Porcelain floor tiles 60×60", spec: "60×60", unit: "m2",
    requiredQty: 18, orderedQty: 0, receivedQty: 0,
    plannedUnitPrice: 2000, actualUnitPrice: null,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-1-6"], archived: false,
    createdAt: "2025-01-25T08:30:00Z", updatedAt: "2025-01-25T08:30:00Z",
  },
  {
    id: "proc-2-1", projectId: "project-2", stageId: "stage-2-2", categoryId: null,
    name: "Tempered glass panels", spec: null, unit: "m2",
    requiredQty: 30, orderedQty: 0, receivedQty: 0,
    plannedUnitPrice: 5000, actualUnitPrice: null,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-2-3"], archived: false,
    createdAt: "2025-02-02T09:00:00Z", updatedAt: "2025-02-02T09:00:00Z",
  },
  {
    id: "proc-3-1", projectId: "project-3", stageId: "stage-3-3", categoryId: null,
    name: "Concrete pavers", spec: null, unit: "m2",
    requiredQty: 120, orderedQty: 120, receivedQty: 120,
    plannedUnitPrice: 1200, actualUnitPrice: 1200,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-3-7"], archived: false,
    createdAt: "2025-01-15T08:00:00Z", updatedAt: "2025-01-25T08:00:00Z",
  },
  {
    id: "proc-3-2", projectId: "project-3", stageId: "stage-3-2", categoryId: null,
    name: "Crushed stone base", spec: null, unit: "m3",
    requiredQty: 8, orderedQty: 8, receivedQty: 5,
    plannedUnitPrice: 4000, actualUnitPrice: 4000,
    supplier: null, linkUrl: null, notes: "3 m³ pending delivery", attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-3-3", "task-3-6"], archived: false,
    createdAt: "2025-01-15T08:00:00Z", updatedAt: "2025-01-28T08:00:00Z",
  },
  {
    id: "proc-3-3", projectId: "project-3", stageId: "stage-3-2", categoryId: null,
    name: "Geotextile fabric", spec: null, unit: "m2",
    requiredQty: 150, orderedQty: 150, receivedQty: 150,
    plannedUnitPrice: 120, actualUnitPrice: 120,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-3-4"], archived: false,
    createdAt: "2025-01-15T08:00:00Z", updatedAt: "2025-01-18T08:00:00Z",
  },
  {
    id: "proc-3-4", projectId: "project-3", stageId: "stage-3-4", categoryId: null,
    name: "Decorative gravel", spec: null, unit: "m3",
    requiredQty: 3, orderedQty: 0, receivedQty: 0,
    plannedUnitPrice: 6000, actualUnitPrice: null,
    supplier: null, linkUrl: null, notes: "Supplier delay — expected next week", attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-3-9"], archived: false,
    createdAt: "2025-01-20T08:00:00Z", updatedAt: "2025-02-01T10:00:00Z",
  },
  {
    id: "proc-3-5", projectId: "project-3", stageId: "stage-3-2", categoryId: null,
    name: "Lawn border edging", spec: null, unit: "m",
    requiredQty: 60, orderedQty: 60, receivedQty: 60,
    plannedUnitPrice: 250, actualUnitPrice: 250,
    supplier: null, linkUrl: null, notes: null, attachments: [],
    createdFrom: "estimate", linkedTaskIds: ["task-3-5"], archived: false,
    createdAt: "2025-01-15T08:00:00Z", updatedAt: "2025-01-20T08:00:00Z",
  },
];

// --- In-memory state ---
let items: ProcurementItemV2[] = [...seedItems];

// --- Pub/Sub ---
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeProcurement(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

// --- Read ---
export function getProcurementItems(projectId: string, includeArchived = false): ProcurementItemV2[] {
  return items.filter((i) => i.projectId === projectId && (includeArchived || !i.archived));
}

export function getProcurementItemById(id: string): ProcurementItemV2 | undefined {
  return items.find((i) => i.id === id);
}

function findByMatchingKey(key: string, projectId: string): ProcurementItemV2 | undefined {
  return items.find((i) =>
    i.projectId === projectId &&
    !i.archived &&
    matchingKey(i.name, i.spec, i.unit, i.stageId) === key
  );
}

// --- Write ---
function genId(): string {
  return `proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addProcurementItem(item: Omit<ProcurementItemV2, "id" | "createdAt" | "updatedAt"> & { id?: string }): ProcurementItemV2 {
  const now = new Date().toISOString();
  const newItem: ProcurementItemV2 = {
    ...item,
    id: item.id ?? genId(),
    createdAt: now,
    updatedAt: now,
  };
  items = [...items, newItem];
  notify();
  return newItem;
}

export function updateProcurementItem(id: string, partial: Partial<ProcurementItemV2>) {
  items = items.map((i) =>
    i.id === id ? { ...i, ...partial, updatedAt: new Date().toISOString() } : i
  );
  notify();
}

export function archiveProcurementItem(id: string) {
  updateProcurementItem(id, { archived: true });
}

export function receiveProcurementItem(id: string, qty: number, actualUnitPrice?: number | null) {
  const item = getProcurementItemById(id);
  if (!item) return;
  const updates: Partial<ProcurementItemV2> = {
    receivedQty: item.receivedQty + qty,
  };
  if (actualUnitPrice != null) updates.actualUnitPrice = actualUnitPrice;
  updateProcurementItem(id, updates);
}

export function orderProcurementItem(id: string, qty: number, supplier?: string | null) {
  const item = getProcurementItemById(id);
  if (!item) return;
  const updates: Partial<ProcurementItemV2> = {
    orderedQty: item.orderedQty + qty,
  };
  if (supplier != null) updates.supplier = supplier;
  updateProcurementItem(id, updates);
}

// --- Sync from Estimate ---
export function syncFromEstimate(projectId: string, stageId: string, estimateItems: StageEstimateItem[]) {
  for (const ei of estimateItems) {
    if (ei.type !== "material") continue;
    const key = matchingKey(ei.itemName, null, ei.unit ?? "pcs", stageId);
    const existing = findByMatchingKey(key, projectId);
    if (existing) {
      // Only update requiredQty and plannedUnitPrice
      const plannedUnit = ei.qty && ei.qty > 0 ? ei.planned / ei.qty : null;
      updateProcurementItem(existing.id, {
        requiredQty: ei.qty ?? existing.requiredQty,
        plannedUnitPrice: plannedUnit ?? existing.plannedUnitPrice,
      });
    } else {
      const plannedUnit = ei.qty && ei.qty > 0 ? ei.planned / ei.qty : null;
      addProcurementItem({
        projectId,
        stageId,
        categoryId: null,
        name: ei.itemName,
        spec: null,
        unit: ei.unit ?? "pcs",
        requiredQty: ei.qty ?? 1,
        orderedQty: 0,
        receivedQty: 0,
        plannedUnitPrice: plannedUnit,
        actualUnitPrice: null,
        supplier: null,
        linkUrl: null,
        notes: null,
        attachments: [],
        createdFrom: "estimate",
        linkedTaskIds: [],
        archived: false,
      });
    }
  }
}

// --- Sync from Checklist Material ---
export function linkChecklistMaterial(
  checklistItem: { id: string; text: string },
  task: { id: string; project_id: string; stage_id: string },
): string {
  // Try match existing
  const key = matchingKey(checklistItem.text, null, "pcs", task.stage_id);
  const existing = findByMatchingKey(key, task.project_id);

  if (existing) {
    // Link task if not already
    if (!existing.linkedTaskIds.includes(task.id)) {
      updateProcurementItem(existing.id, {
        linkedTaskIds: [...existing.linkedTaskIds, task.id],
      });
    }
    return existing.id;
  }

  // Create new
  const newItem = addProcurementItem({
    projectId: task.project_id,
    stageId: task.stage_id,
    categoryId: null,
    name: checklistItem.text,
    spec: null,
    unit: "pcs",
    requiredQty: 1,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: null,
    actualUnitPrice: null,
    supplier: null,
    linkUrl: null,
    notes: null,
    attachments: [],
    createdFrom: "task_material",
    linkedTaskIds: [task.id],
    archived: false,
  });
  return newItem.id;
}

// --- Unlink task from procurement items ---
export function unlinkTaskFromProcurement(taskId: string) {
  items = items.map((i) =>
    i.linkedTaskIds.includes(taskId)
      ? { ...i, linkedTaskIds: i.linkedTaskIds.filter((t) => t !== taskId), updatedAt: new Date().toISOString() }
      : i
  );
  notify();
}

// --- Archive items for a stage ---
export function archiveItemsForStage(stageId: string) {
  items = items.map((i) =>
    i.stageId === stageId ? { ...i, archived: true, updatedAt: new Date().toISOString() } : i
  );
  notify();
}
