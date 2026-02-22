import type { Task, ChecklistItem } from "@/types/entities";
import { subscribe } from "@/data/store";
import { syncFromEstimate } from "@/data/procurement-store";

// --- Types ---
export type EstimateItemSourceType = "TASK" | "CHECKLIST" | "MANUAL";
export type EstimateItemType = "work" | "material" | "other";

export interface Receipt {
  id: string;
  estimateItemId: string;
  imageUrl: string;
  comment?: string;
  uploadedAt: string;
}

export interface StageEstimateItem {
  id: string;
  projectId: string;
  stageId: string;
  sourceType: EstimateItemSourceType;
  sourceId: string | null;
  itemName: string;
  originalName?: string; // tracks original name for linked items
  isNameOverridden: boolean;
  type: EstimateItemType;
  qty: number | null;
  unit: string | null;
  planned: number;
  paid: number | null;
  receipts: Receipt[];
  createdAt: string;
  updatedAt: string;
}

// --- Material keyword heuristic ---
const MATERIAL_KEYWORDS = [
  "tile", "drywall", "paint", "cement", "screws", "pipe", "cable",
  "glass", "quartz", "cabinet", "countertop", "slab", "panel",
  "sheet", "board", "brick", "mortar", "plaster", "lumber", "wood",
  "flooring", "laminate", "vinyl", "insulation", "wire", "fixture",
];

export function inferItemType(title: string): EstimateItemType {
  const lower = title.toLowerCase();
  return MATERIAL_KEYWORDS.some((k) => lower.includes(k)) ? "material" : "work";
}

// --- Seed data (converted from old estimate items) ---
const seedStageEstimateItems: StageEstimateItem[] = [
  // Project 1
  { id: "sei-1-1", projectId: "project-1", stageId: "stage-1-1", sourceType: "TASK", sourceId: "task-1-1", itemName: "Remove old flooring", originalName: "Remove old flooring", isNameOverridden: false, type: "work", qty: 65, unit: "m²", planned: 19500, paid: 19500, receipts: [], createdAt: "2025-01-10T09:00:00Z", updatedAt: "2025-01-10T09:00:00Z" },
  { id: "sei-1-2", projectId: "project-1", stageId: "stage-1-1", sourceType: "TASK", sourceId: "task-1-2", itemName: "Remove wall tiles in bathroom", originalName: "Remove wall tiles in bathroom", isNameOverridden: false, type: "work", qty: 12, unit: "m²", planned: 6000, paid: 6000, receipts: [], createdAt: "2025-01-10T09:30:00Z", updatedAt: "2025-01-10T09:30:00Z" },
  { id: "sei-1-3", projectId: "project-1", stageId: "stage-1-2", sourceType: "TASK", sourceId: "task-1-3", itemName: "Electrical rough-in", originalName: "Electrical rough-in", isNameOverridden: false, type: "work", qty: 24, unit: "points", planned: 48000, paid: 20000, receipts: [], createdAt: "2025-01-20T10:00:00Z", updatedAt: "2025-01-20T10:00:00Z" },
  { id: "sei-1-4", projectId: "project-1", stageId: "stage-1-2", sourceType: "TASK", sourceId: "task-1-4", itemName: "Plumbing rough-in", originalName: "Plumbing rough-in", isNameOverridden: false, type: "work", qty: 8, unit: "points", planned: 32000, paid: 0, receipts: [], createdAt: "2025-01-20T10:30:00Z", updatedAt: "2025-01-20T10:30:00Z" },
  { id: "sei-1-5", projectId: "project-1", stageId: "stage-1-3", sourceType: "TASK", sourceId: "task-1-5", itemName: "Drywall installation", originalName: "Drywall installation", isNameOverridden: false, type: "material", qty: 40, unit: "pcs", planned: 24000, paid: 0, receipts: [], createdAt: "2025-01-25T08:00:00Z", updatedAt: "2025-01-25T08:00:00Z" },
  { id: "sei-1-6", projectId: "project-1", stageId: "stage-1-3", sourceType: "TASK", sourceId: "task-1-6", itemName: "Tile installation — bathroom", originalName: "Tile installation — bathroom", isNameOverridden: false, type: "material", qty: 18, unit: "m²", planned: 36000, paid: 0, receipts: [], createdAt: "2025-01-25T08:30:00Z", updatedAt: "2025-01-25T08:30:00Z" },
  // Project 2
  { id: "sei-2-1", projectId: "project-2", stageId: "stage-2-1", sourceType: "TASK", sourceId: "task-2-1", itemName: "Create floor plan", originalName: "Create floor plan", isNameOverridden: false, type: "work", qty: 1, unit: "project", planned: 80000, paid: 0, receipts: [], createdAt: "2025-02-01T10:00:00Z", updatedAt: "2025-02-01T10:00:00Z" },
  { id: "sei-2-2", projectId: "project-2", stageId: "stage-2-2", sourceType: "TASK", sourceId: "task-2-3", itemName: "Build glass partitions", originalName: "Build glass partitions", isNameOverridden: false, type: "material", qty: 30, unit: "m²", planned: 150000, paid: 0, receipts: [], createdAt: "2025-02-02T09:00:00Z", updatedAt: "2025-02-02T09:00:00Z" },
  { id: "sei-2-3", projectId: "project-2", stageId: "stage-2-2", sourceType: "TASK", sourceId: "task-2-4", itemName: "HVAC installation", originalName: "HVAC installation", isNameOverridden: false, type: "work", qty: 6, unit: "units", planned: 120000, paid: 0, receipts: [], createdAt: "2025-02-02T09:30:00Z", updatedAt: "2025-02-02T09:30:00Z" },
  // Project 3
  { id: "sei-3-1", projectId: "project-3", stageId: "stage-3-1", sourceType: "TASK", sourceId: "task-3-1", itemName: "Demo old cabinets", originalName: "Demo old cabinets", isNameOverridden: false, type: "work", qty: 1, unit: "project", planned: 15000, paid: 15000, receipts: [], createdAt: "2025-01-15T08:00:00Z", updatedAt: "2025-01-15T08:00:00Z" },
  { id: "sei-3-2", projectId: "project-3", stageId: "stage-3-2", sourceType: "TASK", sourceId: "task-3-3", itemName: "Install new cabinets", originalName: "Install new cabinets", isNameOverridden: false, type: "material", qty: 1, unit: "set", planned: 180000, paid: 180000, receipts: [], createdAt: "2025-01-20T08:00:00Z", updatedAt: "2025-01-20T08:00:00Z" },
  { id: "sei-3-3", projectId: "project-3", stageId: "stage-3-2", sourceType: "TASK", sourceId: "task-3-4", itemName: "Install quartz countertop", originalName: "Install quartz countertop", isNameOverridden: false, type: "material", qty: 4, unit: "m²", planned: 60000, paid: 60000, receipts: [], createdAt: "2025-01-22T08:00:00Z", updatedAt: "2025-01-22T08:00:00Z" },
];

// --- In-memory state ---
let estimateItems: StageEstimateItem[] = [...seedStageEstimateItems];

// --- Pub/Sub (reuse main store's listeners) ---
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeEstimate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

// --- Read ---
export function getStageEstimateItems(projectId: string): StageEstimateItem[] {
  return estimateItems.filter((i) => i.projectId === projectId);
}

export function getEstimateItemsByStage(stageId: string): StageEstimateItem[] {
  return estimateItems.filter((i) => i.stageId === stageId);
}

export function getEstimateItemBySourceId(sourceId: string): StageEstimateItem | undefined {
  return estimateItems.find((i) => i.sourceId === sourceId);
}

export function getEstimateItemById(id: string): StageEstimateItem | undefined {
  return estimateItems.find((i) => i.id === id);
}

// --- Write ---
export function addStageEstimateItem(item: StageEstimateItem) {
  // Prevent duplicates for linked items
  if (item.sourceId && getEstimateItemBySourceId(item.sourceId)) return;
  estimateItems = [...estimateItems, item];
  notify();
}

export function updateStageEstimateItem(id: string, partial: Partial<StageEstimateItem>) {
  estimateItems = estimateItems.map((i) =>
    i.id === id ? { ...i, ...partial, updatedAt: new Date().toISOString() } : i
  );
  notify();
  // Sync material items to procurement
  const updated = estimateItems.find((i) => i.id === id);
  if (updated && updated.type === "material") {
    syncFromEstimate(updated.projectId, updated.stageId, [updated]);
  }
}

export function deleteStageEstimateItem(id: string) {
  estimateItems = estimateItems.filter((i) => i.id !== id);
  notify();
}

export function deleteEstimateItemsBySourceId(sourceId: string) {
  estimateItems = estimateItems.filter((i) => i.sourceId !== sourceId);
  notify();
}

export function unlinkEstimateItem(id: string) {
  estimateItems = estimateItems.map((i) =>
    i.id === id ? { ...i, sourceType: "MANUAL" as const, sourceId: null, updatedAt: new Date().toISOString() } : i
  );
  notify();
}

export function moveEstimateItemToStage(sourceId: string, newStageId: string) {
  estimateItems = estimateItems.map((i) =>
    i.sourceId === sourceId ? { ...i, stageId: newStageId, updatedAt: new Date().toISOString() } : i
  );
  notify();
}

// --- Sync helpers ---
export function createEstimateItemForTask(task: { id: string; project_id: string; stage_id: string; title: string }) {
  if (getEstimateItemBySourceId(task.id)) return; // already exists
  const item: StageEstimateItem = {
    id: `sei-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: task.project_id,
    stageId: task.stage_id,
    sourceType: "TASK",
    sourceId: task.id,
    itemName: task.title,
    originalName: task.title,
    isNameOverridden: false,
    type: inferItemType(task.title),
    qty: null,
    unit: null,
    planned: 0,
    paid: null,
    receipts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addStageEstimateItem(item);
}

export function createEstimateItemForChecklist(
  checklistItem: { id: string; text: string },
  task: { project_id: string; stage_id: string }
) {
  if (getEstimateItemBySourceId(checklistItem.id)) return;
  const item: StageEstimateItem = {
    id: `sei-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: task.project_id,
    stageId: task.stage_id,
    sourceType: "CHECKLIST",
    sourceId: checklistItem.id,
    itemName: checklistItem.text,
    originalName: checklistItem.text,
    isNameOverridden: false,
    type: inferItemType(checklistItem.text),
    qty: null,
    unit: null,
    planned: 0,
    paid: null,
    receipts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addStageEstimateItem(item);
}

export function syncEstimateItemName(sourceId: string, newName: string) {
  const item = getEstimateItemBySourceId(sourceId);
  if (!item || item.isNameOverridden) return;
  updateStageEstimateItem(item.id, { itemName: newName, originalName: newName });
}

// Count linked estimate items for a task (including its checklist items)
export function countLinkedEstimateItems(taskId: string, checklistItemIds: string[]): number {
  let count = 0;
  if (getEstimateItemBySourceId(taskId)) count++;
  for (const cId of checklistItemIds) {
    if (getEstimateItemBySourceId(cId)) count++;
  }
  return count;
}

// Delete all estimate items linked to a task and its checklist
export function deleteEstimateItemsForTask(taskId: string, checklistItemIds: string[]) {
  estimateItems = estimateItems.filter((i) => {
    if (i.sourceId === taskId) return false;
    if (i.sourceId && checklistItemIds.includes(i.sourceId)) return false;
    return true;
  });
  notify();
}
