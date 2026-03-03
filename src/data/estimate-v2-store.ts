import { getAuthRole } from "@/lib/auth-state";
import { getStageEstimateItems } from "@/data/estimate-store";
import {
  addEvent,
  addTask,
  getCurrentUser,
  getProject,
  getProjects,
  getStages,
  getTask,
  getTasks,
  subscribe as subscribeMainStore,
  updateChecklist,
  updateTask,
} from "@/data/store";
import {
  computeLineTotals,
  roundHalfUpDiv,
} from "@/lib/estimate-v2/pricing";
import {
  applyFSConstraints,
  autoScheduleSequential,
  clampWorkDates,
  detectCycle,
  toDayIndex,
  validateNoCycles,
} from "@/lib/estimate-v2/schedule";
import { syncProcurementFromEstimateV2 } from "@/lib/estimate-v2/procurement-sync";
import { syncHRFromEstimateV2 } from "@/data/hr-store";
import type { ChecklistItem, ChecklistItemType, Task, TaskStatus } from "@/types/entities";
import type {
  ApprovalStamp,
  EstimateExecutionStatus,
  EstimateV2Dependency,
  EstimateV2DiffFieldChange,
  EstimateV2DiffEntityChange,
  EstimateV2DiffResult,
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Snapshot,
  EstimateV2Stage,
  EstimateV2StructuredChange,
  EstimateV2Version,
  EstimateV2Work,
  EstimateV2WorkStatus,
  Regime,
  ResourceLineType,
  ScheduleBaseline,
} from "@/types/estimate-v2";

interface EstimateV2ProjectState {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
  versions: EstimateV2Version[];
  scheduleBaseline: ScheduleBaseline | null;
}

export interface EstimateV2ProjectView {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
  versions: EstimateV2Version[];
  scheduleBaseline: ScheduleBaseline | null;
}

interface ApproveVersionOptions {
  actorId?: string;
}

interface SetProjectEstimateStatusOptions {
  skipSetup?: boolean;
}

type SetProjectEstimateStatusFailureReason = "forbidden" | "missing_work_dates" | "incomplete_tasks";

interface StatusFailureTask {
  taskId: string | null;
  title: string;
}

export interface SetProjectEstimateStatusResult {
  ok: boolean;
  reason?: SetProjectEstimateStatusFailureReason;
  missingWorkIds?: string[];
  incompleteTasks?: StatusFailureTask[];
  autoScheduled?: boolean;
  baselineCaptured?: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const statesByProjectId = new Map<string, EstimateV2ProjectState>();
const DEMO_PROJECT_IDS = new Set(["project-1", "project-2", "project-3"]);
const RESOURCE_TYPE_ORDER: Record<ResourceLineType, number> = {
  material: 0,
  tool: 1,
  labor: 2,
  subcontractor: 3,
  other: 4,
};

let crossSyncInProgress = false;
let mainStoreUnsubscribe: (() => void) | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function runWithCrossSyncGuard<T>(fn: () => T): T {
  crossSyncInProgress = true;
  try {
    return fn();
  } finally {
    crossSyncInProgress = false;
  }
}

function checklistTypeForLineType(type: ResourceLineType): ChecklistItemType {
  if (type === "material") return "material";
  if (type === "tool") return "tool";
  return "subtask";
}

function mapTaskStatusToWorkStatus(status: TaskStatus): EstimateV2WorkStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  return "not_started";
}

function mapWorkStatusToTaskStatus(status: EstimateV2WorkStatus): TaskStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  return "not_started";
}

function normalizedLagDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function isoStartOfToday(): string {
  const date = new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return start.toISOString();
}

function normalizeIsoDate(input: string): string | null {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeChecklistItemText(line: EstimateV2ResourceLine): string {
  return line.title;
}

function equalChecklistItem(a: ChecklistItem, b: ChecklistItem): boolean {
  return a.id === b.id
    && a.text === b.text
    && a.done === b.done
    && (a.type ?? "subtask") === (b.type ?? "subtask")
    && (a.procurementItemId ?? null) === (b.procurementItemId ?? null)
    && (a.estimateV2LineId ?? null) === (b.estimateV2LineId ?? null)
    && (a.estimateV2WorkId ?? null) === (b.estimateV2WorkId ?? null)
    && (a.estimateV2ResourceType ?? null) === (b.estimateV2ResourceType ?? null)
    && (a.estimateV2QtyMilli ?? null) === (b.estimateV2QtyMilli ?? null)
    && (a.estimateV2Unit ?? null) === (b.estimateV2Unit ?? null);
}

function equalChecklistArray(a: ChecklistItem[], b: ChecklistItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!equalChecklistItem(a[i], b[i])) return false;
  }
  return true;
}

function resolveCurrency(): string {
  // TODO: use persisted profile currency when mock auth/profile settings expose it.
  if (typeof window === "undefined") return "RUB";
  const raw = window.localStorage.getItem("profile-currency");
  if (!raw) return "RUB";
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return "RUB";
  return normalized;
}

function mapLegacyType(type: "work" | "material" | "other"): ResourceLineType {
  if (type === "material") return "material";
  if (type === "work") return "labor";
  return "other";
}

function toQtyMilli(qty: number | null): number {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return 1_000;
  return Math.max(1, Math.round(qty * 1_000));
}

function toCostUnitCents(plannedMajor: number, qtyMilli: number): number {
  const totalCents = Math.max(0, Math.round((Number.isFinite(plannedMajor) ? plannedMajor : 0) * 100));
  if (qtyMilli <= 0) return totalCents;
  return roundHalfUpDiv(totalCents * 1_000, qtyMilli);
}

function cloneSnapshot(snapshot: EstimateV2Snapshot): EstimateV2Snapshot {
  return {
    project: { ...snapshot.project },
    stages: snapshot.stages.map((stage) => ({ ...stage })),
    works: snapshot.works.map((work) => ({ ...work })),
    lines: snapshot.lines.map((line) => ({ ...line })),
    dependencies: snapshot.dependencies.map((dep) => ({ ...dep })),
  };
}

function cloneState(state: EstimateV2ProjectState): EstimateV2ProjectView {
  return {
    project: { ...state.project },
    stages: state.stages.map((stage) => ({ ...stage })),
    works: state.works.map((work) => ({ ...work })),
    lines: state.lines.map((line) => ({ ...line })),
    dependencies: state.dependencies.map((dep) => ({ ...dep })),
    versions: state.versions.map((version) => ({
      ...version,
      approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
      snapshot: cloneSnapshot(version.snapshot),
    })),
    scheduleBaseline: state.scheduleBaseline
      ? {
        ...state.scheduleBaseline,
        works: state.scheduleBaseline.works.map((work) => ({ ...work })),
      }
      : null,
  };
}

function getSnapshotFromState(state: EstimateV2ProjectState): EstimateV2Snapshot {
  return {
    project: { ...state.project },
    stages: state.stages.map((stage) => ({ ...stage })),
    works: state.works.map((work) => ({ ...work })),
    lines: state.lines.map((line) => ({ ...line })),
    dependencies: state.dependencies.map((dep) => ({ ...dep })),
  };
}

function syncExternalDomainsFromEstimate(projectId: string, state: EstimateV2ProjectState) {
  const syncState = {
    project: state.project,
    lines: state.lines,
  };
  syncProcurementFromEstimateV2(projectId, syncState);
  syncHRFromEstimateV2(projectId, syncState);
}

function isOwnerActionAllowed(projectId: string): boolean {
  const project = getProject(projectId);
  const user = getCurrentUser();
  if (!project || project.owner_id !== user.id) return false;

  const role = getAuthRole();
  return role === "owner";
}

export function isDemoProject(projectId: string): boolean {
  return DEMO_PROJECT_IDS.has(projectId);
}

function sortWorksByStageAndOrder(state: EstimateV2ProjectState): EstimateV2Work[] {
  const stageOrderById = new Map(state.stages.map((stage) => [stage.id, stage.order]));
  return [...state.works].sort((a, b) => {
    const stageOrderA = stageOrderById.get(a.stageId) ?? Number.MAX_SAFE_INTEGER;
    const stageOrderB = stageOrderById.get(b.stageId) ?? Number.MAX_SAFE_INTEGER;
    if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function syncChecklistForWork(state: EstimateV2ProjectState, work: EstimateV2Work) {
  if (!work.taskId) return;
  const task = getTask(work.taskId);
  if (!task) return;

  const lines = state.lines
    .filter((line) => line.workId === work.id)
    .sort((a, b) => {
      const typeOrderA = RESOURCE_TYPE_ORDER[a.type];
      const typeOrderB = RESOURCE_TYPE_ORDER[b.type];
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      return a.id.localeCompare(b.id);
    });

  const existingEstimateItems = new Map(
    task.checklist
      .filter((item) => item.estimateV2LineId)
      .map((item) => [item.estimateV2LineId as string, item]),
  );

  const generatedItems: ChecklistItem[] = lines.map((line) => {
    const existing = existingEstimateItems.get(line.id);
    return {
      id: `ev2-line-${line.id}`,
      text: normalizeChecklistItemText(line),
      done: existing?.done ?? false,
      type: checklistTypeForLineType(line.type),
      estimateV2LineId: line.id,
      estimateV2WorkId: work.id,
      estimateV2ResourceType: line.type,
      estimateV2QtyMilli: line.qtyMilli,
      estimateV2Unit: line.unit,
    };
  });

  const manualItems = task.checklist.filter((item) => !item.estimateV2LineId);
  const nextChecklist = [...manualItems, ...generatedItems];

  if (equalChecklistArray(task.checklist, nextChecklist)) return;
  runWithCrossSyncGuard(() => updateChecklist(task.id, nextChecklist));
}

function syncTaskFromWork(work: EstimateV2Work): boolean {
  if (!work.taskId) return false;
  const task = getTask(work.taskId);
  if (!task) return false;

  const partial: Partial<Task> = {};
  if (task.title !== work.title) partial.title = work.title;
  if ((task.startDate ?? null) !== (work.plannedStart ?? null)) {
    partial.startDate = work.plannedStart ?? undefined;
  }
  if ((task.deadline ?? null) !== (work.plannedEnd ?? null)) {
    partial.deadline = work.plannedEnd ?? undefined;
  }
  const expectedTaskStatus = mapWorkStatusToTaskStatus(work.status);
  if (task.status !== expectedTaskStatus) partial.status = expectedTaskStatus;

  if (Object.keys(partial).length === 0) return false;
  runWithCrossSyncGuard(() => updateTask(task.id, partial));
  return true;
}

function materializeTasksForAllWorks(projectId: string, state: EstimateV2ProjectState): { created: number; updated: number } {
  const user = getCurrentUser();
  const now = nowIso();
  let created = 0;
  let updated = 0;

  const sortedWorks = sortWorksByStageAndOrder(state);
  const nextWorksById = new Map<string, EstimateV2Work>();
  sortedWorks.forEach((work) => {
    let linkedTask = work.taskId ? getTask(work.taskId) : undefined;

    if (!linkedTask) {
      const taskId = `task-ev2-${work.id}`;
      const newTask: Task = {
        id: taskId,
        project_id: projectId,
        stage_id: work.stageId,
        title: work.title,
        description: "Auto-created from Estimate v2 work",
        status: "not_started",
        assignee_id: user.id,
        checklist: [],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: now,
        startDate: work.plannedStart ?? undefined,
        deadline: work.plannedEnd ?? undefined,
      };
      runWithCrossSyncGuard(() => addTask(newTask, { actorId: user.id, source: "estimate_v2_materialize" }));
      linkedTask = getTask(taskId);
      created += 1;
    }

    if (linkedTask) {
      const partial: Partial<Task> = {};
      if (linkedTask.title !== work.title) partial.title = work.title;
      if ((linkedTask.startDate ?? null) !== (work.plannedStart ?? null)) {
        partial.startDate = work.plannedStart ?? undefined;
      }
      if ((linkedTask.deadline ?? null) !== (work.plannedEnd ?? null)) {
        partial.deadline = work.plannedEnd ?? undefined;
      }
      if (linkedTask.status !== "not_started") partial.status = "not_started";
      if (Object.keys(partial).length > 0) {
        runWithCrossSyncGuard(() => updateTask(linkedTask!.id, partial));
        updated += 1;
      }

      const nextWork: EstimateV2Work = {
        ...work,
        taskId: linkedTask.id,
        status: "not_started",
        updatedAt: now,
      };
      nextWorksById.set(work.id, nextWork);
      syncChecklistForWork(state, nextWork);
    }
  });

  if (nextWorksById.size > 0) {
    state.works = state.works.map((work) => nextWorksById.get(work.id) ?? work);
  }

  return { created, updated };
}

function syncFromMainTaskStore() {
  if (crossSyncInProgress) return;
  const now = nowIso();
  let hasChanges = false;

  statesByProjectId.forEach((state, projectId) => {
    const tasksById = new Map(getTasks(projectId).map((task) => [task.id, task]));
    let stateChanged = false;

    state.works = state.works.map((work) => {
      if (!work.taskId) return work;
      const task = tasksById.get(work.taskId);
      if (!task) return work;

      const nextTitle = task.title;
      const nextStatus = mapTaskStatusToWorkStatus(task.status);
      const nextPlannedStart = task.startDate ?? null;
      const nextPlannedEnd = task.deadline ?? null;

      if (
        nextTitle === work.title
        && nextStatus === work.status
        && nextPlannedStart === (work.plannedStart ?? null)
        && nextPlannedEnd === (work.plannedEnd ?? null)
      ) {
        return work;
      }

      stateChanged = true;
      return {
        ...work,
        title: nextTitle,
        status: nextStatus,
        plannedStart: nextPlannedStart,
        plannedEnd: nextPlannedEnd,
        updatedAt: now,
      };
    });

    state.lines = state.lines.map((line) => {
      const work = state.works.find((entry) => entry.id === line.workId);
      if (!work?.taskId) return line;
      const task = tasksById.get(work.taskId);
      if (!task) return line;

      const checklistItem = task.checklist.find((item) => item.estimateV2LineId === line.id);
      if (!checklistItem) return line;

      const nextTitle = checklistItem.text || line.title;
      const nextQtyMilli = Number.isFinite(checklistItem.estimateV2QtyMilli)
        ? Math.max(1, Math.round(checklistItem.estimateV2QtyMilli as number))
        : line.qtyMilli;
      const nextUnit = checklistItem.estimateV2Unit?.trim() || line.unit;
      const nextType = checklistItem.estimateV2ResourceType ?? line.type;

      if (
        nextTitle === line.title
        && nextQtyMilli === line.qtyMilli
        && nextUnit === line.unit
        && nextType === line.type
      ) {
        return line;
      }

      stateChanged = true;
      return {
        ...line,
        title: nextTitle,
        qtyMilli: nextQtyMilli,
        unit: nextUnit,
        type: nextType,
        updatedAt: now,
      };
    });

    if (stateChanged) {
      state.project.updatedAt = now;
      hasChanges = true;
    }
  });

  if (hasChanges) notify();
}

function ensureMainStoreSubscription() {
  if (mainStoreUnsubscribe) return;
  mainStoreUnsubscribe = subscribeMainStore(() => {
    syncFromMainTaskStore();
  });
}

function ensureProjectState(projectId: string): EstimateV2ProjectState {
  const existing = statesByProjectId.get(projectId);
  if (existing) return existing;

  const createdAt = nowIso();
  const projectEntity = getProject(projectId);
  const storeStages = getStages(projectId);
  const legacyItems = getStageEstimateItems(projectId);

  const fallbackStageIds = Array.from(new Set(legacyItems.map((item) => item.stageId)));
  const fallbackStages = fallbackStageIds.map((stageId, index) => ({
    id: stageId,
    project_id: projectId,
    title: `Stage ${index + 1}`,
    description: "",
    order: index + 1,
    status: "open" as const,
  }));

  const mergedStagesById = new Map<string, (typeof fallbackStages)[number]>();
  storeStages.forEach((stage) => mergedStagesById.set(stage.id, stage));
  fallbackStages.forEach((stage) => {
    if (!mergedStagesById.has(stage.id)) mergedStagesById.set(stage.id, stage);
  });

  const orderedStages = [...mergedStagesById.values()].sort((a, b) => a.order - b.order);

  const stages: EstimateV2Stage[] = orderedStages.map((stage) => ({
    id: stage.id,
    projectId,
    title: stage.title,
    order: stage.order,
    discountBps: 0,
    createdAt,
    updatedAt: createdAt,
  }));

  const works: EstimateV2Work[] = stages.map((stage, index) => ({
    id: `work-${projectId}-${stage.id}-default-${index}`,
    projectId,
    stageId: stage.id,
    title: "General work",
    order: 1,
    discountBps: 0,
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt,
    updatedAt: createdAt,
  }));

  const workIdByStageId = new Map(works.map((work) => [work.stageId, work.id]));
  const lines: EstimateV2ResourceLine[] = legacyItems.map((item, index) => {
    const qtyMilli = toQtyMilli(item.qty);
    const costUnitCents = toCostUnitCents(item.planned, qtyMilli);
    const stageId = item.stageId;
    const workId = workIdByStageId.get(stageId) ?? works[0]?.id ?? id("work-fallback");

    return {
      id: `line-${projectId}-${index}-${item.id}`,
      projectId,
      stageId,
      workId,
      title: item.itemName,
      type: mapLegacyType(item.type),
      unit: item.unit ?? "unit",
      qtyMilli,
      costUnitCents,
      markupBps: 0,
      discountBpsOverride: null,
      receivedCents: Math.max(0, Math.round((item.paid ?? 0) * 100)),
      pnlPlaceholderCents: 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  const project: EstimateV2Project = {
    id: `estimate-v2-${projectId}`,
    projectId,
    title: projectEntity?.title ?? "Estimate",
    currency: resolveCurrency(),
    regime: "contractor",
    taxBps: 2000,
    discountBps: 0,
    markupBps: 0,
    estimateStatus: "planning",
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt,
    updatedAt: createdAt,
  };

  const state: EstimateV2ProjectState = {
    project,
    stages,
    works,
    lines,
    dependencies: [],
    versions: [],
    scheduleBaseline: null,
  };

  ensureMainStoreSubscription();
  statesByProjectId.set(projectId, state);
  return state;
}

function projectScheduleAnchor(projectId: string): string {
  const tasks = getTasks(projectId)
    .map((task) => normalizeIsoDate(task.created_at))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  return tasks[0] ?? isoStartOfToday();
}

function captureScheduleBaseline(state: EstimateV2ProjectState, capturedAt: string): ScheduleBaseline {
  const works = sortWorksByStageAndOrder(state);
  const baselineWorks = works.map((work) => ({
    workId: work.id,
    baselineStart: work.plannedStart ?? null,
    baselineEnd: work.plannedEnd ?? null,
  }));

  const starts = baselineWorks
    .map((work) => work.baselineStart)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  const ends = baselineWorks
    .map((work) => work.baselineEnd)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));

  return {
    capturedAt,
    projectBaselineStart: starts[0] ?? null,
    projectBaselineEnd: ends[ends.length - 1] ?? null,
    works: baselineWorks,
  };
}

function applyWorkToTaskSync(state: EstimateV2ProjectState, workIds: string[]) {
  const changedWorkIds = new Set(workIds);
  state.works.forEach((work) => {
    if (!changedWorkIds.has(work.id)) return;
    syncTaskFromWork(work);
  });
}

function buildWorksById(works: EstimateV2Work[]): Record<string, EstimateV2Work> {
  return Object.fromEntries(works.map((work) => [work.id, { ...work }]));
}

function applyScheduledDatesFromMap(
  state: EstimateV2ProjectState,
  nextWorksById: Record<string, EstimateV2Work>,
  now: string,
): string[] {
  const changedWorkIds: string[] = [];

  state.works = state.works.map((work) => {
    const next = nextWorksById[work.id];
    if (!next) return work;

    const startChanged = (work.plannedStart ?? null) !== (next.plannedStart ?? null);
    const endChanged = (work.plannedEnd ?? null) !== (next.plannedEnd ?? null);
    if (!startChanged && !endChanged) return work;

    changedWorkIds.push(work.id);
    return {
      ...work,
      plannedStart: next.plannedStart,
      plannedEnd: next.plannedEnd,
      updatedAt: now,
    };
  });

  return changedWorkIds;
}

function shallowEqualExcludingUpdatedAt(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("updatedAt");
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function diffById<T extends { id: string }>(
  prevItems: T[],
  nextItems: T[],
): EstimateV2DiffEntityChange[] {
  const prevById = new Map(prevItems.map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const allIds = new Set([...prevById.keys(), ...nextById.keys()]);
  const result: EstimateV2DiffEntityChange[] = [];

  allIds.forEach((entityId) => {
    const prev = prevById.get(entityId);
    const next = nextById.get(entityId);
    if (!prev && next) {
      result.push({ id: entityId, type: "added" });
      return;
    }
    if (prev && !next) {
      result.push({ id: entityId, type: "removed" });
      return;
    }
    if (prev && next) {
      if (!shallowEqualExcludingUpdatedAt(prev as Record<string, unknown>, next as Record<string, unknown>)) {
        result.push({ id: entityId, type: "updated" });
      }
    }
  });

  return result;
}

function buildStageNumberById(stages: EstimateV2Stage[]): Map<string, number> {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return new Map(sorted.map((stage, index) => [stage.id, index + 1]));
}

function buildWorkNumberById(
  works: EstimateV2Work[],
  stageNumberById: Map<string, number>,
): Map<string, string> {
  const worksByStage = new Map<string, EstimateV2Work[]>();
  works.forEach((work) => {
    const list = worksByStage.get(work.stageId) ?? [];
    list.push(work);
    worksByStage.set(work.stageId, list);
  });

  const result = new Map<string, string>();
  worksByStage.forEach((list, stageId) => {
    const stageNumber = stageNumberById.get(stageId);
    const sorted = [...list].sort((a, b) => a.order - b.order);
    sorted.forEach((work, index) => {
      if (stageNumber == null) return;
      result.set(work.id, `${stageNumber}.${index + 1}`);
    });
  });

  return result;
}

function mapById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function lineClientTotals(
  snapshot: EstimateV2Snapshot,
  line: EstimateV2ResourceLine,
): { clientUnitCents: number; clientTotalCents: number } | null {
  const stage = snapshot.stages.find((entry) => entry.id === line.stageId);
  if (!stage) return null;
  const totals = computeLineTotals(line, stage, snapshot.project, snapshot.project.regime);
  return {
    clientUnitCents: totals.clientUnitCents,
    clientTotalCents: totals.clientTotalCents,
  };
}

function pushFieldChange(
  changes: EstimateV2DiffFieldChange[],
  field: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  if (before === after) return;
  changes.push({ field, label, before, after });
}

function buildLineFieldChanges(
  prevSnapshot: EstimateV2Snapshot | null,
  nextSnapshot: EstimateV2Snapshot,
  prevLine: EstimateV2ResourceLine,
  nextLine: EstimateV2ResourceLine,
): EstimateV2DiffFieldChange[] {
  const fieldChanges: EstimateV2DiffFieldChange[] = [];
  pushFieldChange(fieldChanges, "title", "name", prevLine.title, nextLine.title);
  pushFieldChange(fieldChanges, "type", "type", prevLine.type, nextLine.type);
  pushFieldChange(fieldChanges, "qtyMilli", "qty", prevLine.qtyMilli, nextLine.qtyMilli);
  pushFieldChange(fieldChanges, "unit", "unit", prevLine.unit, nextLine.unit);
  pushFieldChange(fieldChanges, "costUnitCents", "cost price", prevLine.costUnitCents, nextLine.costUnitCents);
  pushFieldChange(fieldChanges, "markupBps", "markup", prevLine.markupBps, nextLine.markupBps);
  pushFieldChange(
    fieldChanges,
    "discountBpsOverride",
    "discount",
    prevLine.discountBpsOverride ?? null,
    nextLine.discountBpsOverride ?? null,
  );

  const prevClientTotals = prevSnapshot ? lineClientTotals(prevSnapshot, prevLine) : null;
  const nextClientTotals = lineClientTotals(nextSnapshot, nextLine);

  if (prevClientTotals && nextClientTotals) {
    pushFieldChange(
      fieldChanges,
      "clientUnitCents",
      "client unit price",
      prevClientTotals.clientUnitCents,
      nextClientTotals.clientUnitCents,
    );
    pushFieldChange(
      fieldChanges,
      "clientTotalCents",
      "line total",
      prevClientTotals.clientTotalCents,
      nextClientTotals.clientTotalCents,
    );
  }

  return fieldChanges;
}

function structuredSort(a: EstimateV2StructuredChange, b: EstimateV2StructuredChange): number {
  const stageA = a.stageNumber ?? Number.MAX_SAFE_INTEGER;
  const stageB = b.stageNumber ?? Number.MAX_SAFE_INTEGER;
  if (stageA !== stageB) return stageA - stageB;

  const parseWorkOrder = (workNumber: string | null): number => {
    if (!workNumber) return Number.MAX_SAFE_INTEGER;
    const tail = Number(workNumber.split(".")[1]);
    return Number.isFinite(tail) ? tail : Number.MAX_SAFE_INTEGER;
  };
  const workA = parseWorkOrder(a.workNumber);
  const workB = parseWorkOrder(b.workNumber);
  if (workA !== workB) return workA - workB;

  const kindOrder = { stage: 0, work: 1, line: 2 } as const;
  if (kindOrder[a.entityKind] !== kindOrder[b.entityKind]) {
    return kindOrder[a.entityKind] - kindOrder[b.entityKind];
  }

  return a.title.localeCompare(b.title);
}

export function subscribeEstimateV2(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEstimateV2ProjectState(projectId: string): EstimateV2ProjectView {
  const state = ensureProjectState(projectId);
  return cloneState(state);
}

export function createStage(projectId: string, input: { title: string; discountBps?: number }): EstimateV2Stage {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const stage: EstimateV2Stage = {
    id: id("stage-v2"),
    projectId,
    title: input.title.trim() || "New stage",
    order: (state.stages[state.stages.length - 1]?.order ?? 0) + 1,
    discountBps: Math.max(0, Math.round(input.discountBps ?? 0)),
    createdAt: now,
    updatedAt: now,
  };
  state.stages.push(stage);
  state.project.updatedAt = now;
  notify();
  return { ...stage };
}

export function updateStage(projectId: string, stageId: string, partial: Partial<EstimateV2Stage>) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  state.stages = state.stages.map((stage) => (
    stage.id === stageId
      ? {
        ...stage,
        ...partial,
        updatedAt: now,
      }
      : stage
  ));
  state.project.updatedAt = now;
  notify();
}

export function deleteStage(projectId: string, stageId: string) {
  const state = ensureProjectState(projectId);
  const workIdsToDelete = new Set(state.works.filter((work) => work.stageId === stageId).map((work) => work.id));

  state.stages = state.stages.filter((stage) => stage.id !== stageId);
  state.works = state.works.filter((work) => !workIdsToDelete.has(work.id));
  state.lines = state.lines.filter((line) => line.stageId !== stageId && !workIdsToDelete.has(line.workId));
  state.dependencies = state.dependencies.filter((dep) => !workIdsToDelete.has(dep.fromWorkId) && !workIdsToDelete.has(dep.toWorkId));
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = nowIso();
  notify();
}

export function createWork(projectId: string, input: { stageId: string; title: string; discountBps?: number }): EstimateV2Work {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const nextOrder = state.works
    .filter((work) => work.stageId === input.stageId)
    .reduce((max, work) => Math.max(max, work.order), 0) + 1;

  const work: EstimateV2Work = {
    id: id("work-v2"),
    projectId,
    stageId: input.stageId,
    title: input.title.trim() || "New work",
    order: nextOrder,
    discountBps: Math.max(0, Math.round(input.discountBps ?? 0)),
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt: now,
    updatedAt: now,
  };

  state.works.push(work);
  state.project.updatedAt = now;
  notify();
  return { ...work };
}

export function updateWork(projectId: string, workId: string, partial: Partial<EstimateV2Work>) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  let changedWork: EstimateV2Work | null = null;
  state.works = state.works.map((work) => (
    work.id === workId
      ? {
        ...work,
        ...partial,
        updatedAt: now,
      }
      : work
  ));
  changedWork = state.works.find((work) => work.id === workId) ?? null;

  if (changedWork) {
    applyWorkToTaskSync(state, [changedWork.id]);
    syncChecklistForWork(state, changedWork);
  }
  state.project.updatedAt = now;
  notify();
}

export function updateWorkDates(
  projectId: string,
  workId: string,
  plannedStart: string,
  plannedEnd: string,
  _options: { source: "gantt" },
): { ok: true; shiftedWorkIds: string[] } | { ok: false; reason: "invalid_work" | "invalid_date" } {
  const state = ensureProjectState(projectId);
  const target = state.works.find((work) => work.id === workId);
  if (!target) return { ok: false, reason: "invalid_work" };

  if (toDayIndex(plannedStart) == null || toDayIndex(plannedEnd) == null) {
    return { ok: false, reason: "invalid_date" };
  }

  const normalized = clampWorkDates({
    plannedStart,
    plannedEnd,
  }, 1);

  const worksById = buildWorksById(state.works);
  const nextTarget = worksById[workId];
  if (!nextTarget) return { ok: false, reason: "invalid_work" };
  worksById[workId] = {
    ...nextTarget,
    plannedStart: normalized.plannedStart,
    plannedEnd: normalized.plannedEnd,
  };

  const constrainedById = applyFSConstraints(worksById, state.dependencies);
  const now = nowIso();
  const changedWorkIds = applyScheduledDatesFromMap(state, constrainedById, now);

  if (changedWorkIds.length === 0) {
    return { ok: true, shiftedWorkIds: [] };
  }

  if (state.project.estimateStatus === "in_work") {
    applyWorkToTaskSync(state, changedWorkIds);
  }

  state.project.updatedAt = now;
  notify();
  return {
    ok: true,
    shiftedWorkIds: changedWorkIds.filter((id) => id !== workId),
  };
}

export function deleteWork(projectId: string, workId: string) {
  const state = ensureProjectState(projectId);
  state.works = state.works.filter((work) => work.id !== workId);
  state.lines = state.lines.filter((line) => line.workId !== workId);
  state.dependencies = state.dependencies.filter((dep) => dep.fromWorkId !== workId && dep.toWorkId !== workId);
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = nowIso();
  notify();
}

export function createLine(
  projectId: string,
  input: {
    stageId: string;
    workId: string;
    title: string;
    type?: ResourceLineType;
    unit?: string;
    qtyMilli?: number;
    costUnitCents?: number;
    markupBps?: number;
    discountBpsOverride?: number | null;
  },
): EstimateV2ResourceLine {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const line: EstimateV2ResourceLine = {
    id: id("line-v2"),
    projectId,
    stageId: input.stageId,
    workId: input.workId,
    title: input.title.trim() || "New line",
    type: input.type ?? "material",
    unit: input.unit?.trim() || "unit",
    qtyMilli: Math.max(1, Math.round(input.qtyMilli ?? 1_000)),
    costUnitCents: Math.max(0, Math.round(input.costUnitCents ?? 0)),
    markupBps: Math.max(0, Math.round(input.markupBps ?? state.project.markupBps ?? 0)),
    discountBpsOverride: input.discountBpsOverride == null ? null : Math.max(0, Math.round(input.discountBpsOverride)),
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: now,
    updatedAt: now,
  };

  state.lines.push(line);
  const parentWork = state.works.find((work) => work.id === line.workId);
  if (parentWork) syncChecklistForWork(state, parentWork);
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = now;
  notify();
  return { ...line };
}

export function updateLine(projectId: string, lineId: string, partial: Partial<EstimateV2ResourceLine>) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const previous = state.lines.find((line) => line.id === lineId) ?? null;
  state.lines = state.lines.map((line) => (
    line.id === lineId
      ? {
        ...line,
        ...partial,
        updatedAt: now,
      }
      : line
  ));
  const updated = state.lines.find((line) => line.id === lineId) ?? null;
  if (previous) {
    const oldWork = state.works.find((work) => work.id === previous.workId);
    if (oldWork) syncChecklistForWork(state, oldWork);
  }
  if (updated) {
    const newWork = state.works.find((work) => work.id === updated.workId);
    if (newWork) syncChecklistForWork(state, newWork);
  }
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = now;
  notify();
}

export function deleteLine(projectId: string, lineId: string) {
  const state = ensureProjectState(projectId);
  const existing = state.lines.find((line) => line.id === lineId) ?? null;
  state.lines = state.lines.filter((line) => line.id !== lineId);
  if (existing) {
    const parentWork = state.works.find((work) => work.id === existing.workId);
    if (parentWork) syncChecklistForWork(state, parentWork);
  }
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = nowIso();
  notify();
}

export function setProjectEstimateStatus(
  projectId: string,
  status: EstimateExecutionStatus,
  options: SetProjectEstimateStatusOptions = {},
): SetProjectEstimateStatusResult {
  if (!isOwnerActionAllowed(projectId)) {
    return {
      ok: false,
      reason: "forbidden",
    };
  }

  const state = ensureProjectState(projectId);
  const now = nowIso();
  const previousStatus = state.project.estimateStatus;
  let autoScheduled = false;
  let baselineCaptured = false;

  if (previousStatus === "planning" && status === "in_work") {
    const missingWorks = sortWorksByStageAndOrder(state).filter((work) => !work.plannedStart || !work.plannedEnd);
    if (missingWorks.length > 0 && !options.skipSetup) {
      return {
        ok: false,
        reason: "missing_work_dates",
        missingWorkIds: missingWorks.map((work) => work.id),
      };
    }

    if (missingWorks.length > 0 && options.skipSetup) {
      const stageOrderById = new Map(state.stages.map((stage) => [stage.id, stage.order]));
      const anchor = projectScheduleAnchor(projectId);
      let scheduled = autoScheduleSequential(state.works, anchor, stageOrderById);
      const cycleValidation = validateNoCycles(state.dependencies);
      if (cycleValidation.valid) {
        const constrainedById = applyFSConstraints(
          Object.fromEntries(scheduled.map((work) => [work.id, work])),
          state.dependencies,
        );
        scheduled = scheduled.map((work) => constrainedById[work.id] ?? work);
      }
      state.works = state.works.map((work) => scheduled.find((entry) => entry.id === work.id) ?? work);
      autoScheduled = true;
    }

    materializeTasksForAllWorks(projectId, state);
    state.scheduleBaseline = captureScheduleBaseline(state, now);
    baselineCaptured = true;
  }

  if (status === "finished") {
    const incompleteTasks: StatusFailureTask[] = [];
    state.works.forEach((work) => {
      const linkedTask = work.taskId ? getTask(work.taskId) : undefined;
      if (!linkedTask || linkedTask.status !== "done") {
        incompleteTasks.push({
          taskId: linkedTask?.id ?? null,
          title: linkedTask?.title ?? work.title,
        });
      }
    });
    if (incompleteTasks.length > 0) {
      return {
        ok: false,
        reason: "incomplete_tasks",
        incompleteTasks,
      };
    }
  }

  state.project = {
    ...state.project,
    estimateStatus: status,
    updatedAt: now,
  };

  syncExternalDomainsFromEstimate(projectId, state);

  if (status !== "in_work") {
    state.works = state.works.map((work) => ({
      ...work,
      updatedAt: now,
    }));
  }

  notify();
  return {
    ok: true,
    autoScheduled,
    baselineCaptured,
  };
}

export function updateEstimateV2Project(projectId: string, partial: Partial<EstimateV2Project>) {
  const state = ensureProjectState(projectId);
  state.project = {
    ...state.project,
    ...partial,
    updatedAt: nowIso(),
  };
  notify();
}

export function setRegime(projectId: string, regime: Regime): boolean {
  if (!isOwnerActionAllowed(projectId)) return false;
  const state = ensureProjectState(projectId);
  state.project = {
    ...state.project,
    regime,
    updatedAt: nowIso(),
  };
  notify();
  return true;
}

export function setRegimeDev(projectId: string, regime: Regime): boolean {
  if (!import.meta.env.DEV) return false;
  if (!isDemoProject(projectId)) return false;
  const state = ensureProjectState(projectId);
  state.project = {
    ...state.project,
    regime,
    updatedAt: nowIso(),
  };
  notify();
  return true;
}

export function addDependency(
  projectId: string,
  fromWorkId: string,
  toWorkId: string,
  lagDays: number,
):
  | { ok: true; dependency: EstimateV2Dependency; shiftedWorkIds: string[] }
  | { ok: false; reason: "self_dependency" | "invalid_work" | "cycle"; cyclePath?: string[] } {
  const state = ensureProjectState(projectId);

  if (fromWorkId === toWorkId) {
    return { ok: false, reason: "self_dependency" };
  }

  const worksById = buildWorksById(state.works);
  if (!worksById[fromWorkId] || !worksById[toWorkId]) {
    return { ok: false, reason: "invalid_work" };
  }

  const now = nowIso();
  const dependency: EstimateV2Dependency = {
    id: id("dep-v2"),
    projectId,
    kind: "FS",
    fromWorkId,
    toWorkId,
    lagDays: normalizedLagDays(lagDays),
    createdAt: now,
    updatedAt: now,
  };

  const candidateDependencies = [...state.dependencies, dependency];
  const cycle = detectCycle(
    state.works.map((work) => ({ id: work.id })),
    candidateDependencies,
  );
  if (cycle.hasCycle) {
    return {
      ok: false,
      reason: "cycle",
      cyclePath: cycle.cyclePath,
    };
  }

  state.dependencies = candidateDependencies;
  const constrainedById = applyFSConstraints(worksById, state.dependencies);
  const changedWorkIds = applyScheduledDatesFromMap(state, constrainedById, now);

  if (state.project.estimateStatus === "in_work" && changedWorkIds.length > 0) {
    applyWorkToTaskSync(state, changedWorkIds);
  }

  state.project.updatedAt = now;
  notify();
  return {
    ok: true,
    dependency: { ...dependency },
    shiftedWorkIds: changedWorkIds,
  };
}

export function removeDependency(projectId: string, dependencyId: string) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  state.dependencies = state.dependencies.filter((dep) => dep.id !== dependencyId);
  state.project.updatedAt = now;
  notify();
}

export function createDependency(
  projectId: string,
  input: { fromWorkId: string; toWorkId: string; lagDays?: number },
): EstimateV2Dependency {
  const result = addDependency(
    projectId,
    input.fromWorkId,
    input.toWorkId,
    input.lagDays ?? 0,
  );
  if (!result.ok) {
    throw new Error(`Unable to create dependency: ${result.reason}`);
  }
  return result.dependency;
}

export function deleteDependency(projectId: string, dependencyId: string) {
  removeDependency(projectId, dependencyId);
}

export function createVersionSnapshot(projectId: string, createdBy: string): { versionId: string; snapshot: EstimateV2Snapshot } {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const snapshot = getSnapshotFromState(state);
  const nextNumber = state.versions.reduce((max, version) => Math.max(max, version.number), 0) + 1;

  const version: EstimateV2Version = {
    id: id("estimate-v2-version"),
    projectId,
    number: nextNumber,
    status: "proposed",
    snapshot,
    shareId: id("share"),
    approvalStamp: null,
    archived: true,
    submitted: false,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  state.versions.push(version);
  state.project.updatedAt = now;
  notify();

  return {
    versionId: version.id,
    snapshot: cloneSnapshot(version.snapshot),
  };
}

export function submitVersion(projectId: string, versionId: string): boolean {
  if (!isOwnerActionAllowed(projectId)) return false;
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const actor = getCurrentUser();

  let submittedVersion: EstimateV2Version | null = null;

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      const next = {
        ...version,
        status: "proposed" as const,
        archived: false,
        submitted: true,
        updatedAt: now,
      };
      submittedVersion = next;
      return next;
    }
    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  if (!submittedVersion) return false;

  addEvent({
    id: id("evt-estimate-v2-submitted"),
    project_id: projectId,
    actor_id: actor.id,
    type: "estimate.version_submitted",
    object_type: "estimate_version",
    object_id: submittedVersion.id,
    timestamp: now,
    payload: {
      projectId,
      versionId: submittedVersion.id,
      actor: actor.id,
      versionNumber: submittedVersion.number,
    },
  });

  state.project.updatedAt = now;
  notify();
  return true;
}

export function approveVersion(
  projectId: string,
  versionId: string,
  stamp: ApprovalStamp,
  options: ApproveVersionOptions = {},
): boolean {
  const state = ensureProjectState(projectId);
  const now = nowIso();

  let approvedVersion: EstimateV2Version | null = null;

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      const next = {
        ...version,
        status: "approved" as const,
        archived: false,
        submitted: true,
        approvalStamp: { ...stamp },
        updatedAt: now,
      };
      approvedVersion = next;
      return next;
    }

    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  if (!approvedVersion) return false;

  const actorId = options.actorId ?? "client";

  addEvent({
    id: id("evt-estimate-v2-approved"),
    project_id: projectId,
    actor_id: actorId,
    type: "estimate.version_approved",
    object_type: "estimate_version",
    object_id: approvedVersion.id,
    timestamp: now,
    payload: {
      projectId,
      versionId: approvedVersion.id,
      actor: actorId,
      versionNumber: approvedVersion.number,
      approverEmail: stamp.email,
    },
  });

  state.project.updatedAt = now;
  notify();
  return true;
}

export function getCurrentVersion(projectId: string): EstimateV2Version | null {
  const state = ensureProjectState(projectId);
  const current = state.versions
    .filter((version) => version.submitted && !version.archived)
    .sort((a, b) => b.number - a.number)[0];

  return current ? {
    ...current,
    approvalStamp: current.approvalStamp ? { ...current.approvalStamp } : null,
    snapshot: cloneSnapshot(current.snapshot),
  } : null;
}

export function getLatestApprovedVersion(projectId: string): EstimateV2Version | null {
  const state = ensureProjectState(projectId);
  const latest = state.versions
    .filter((version) => version.status === "approved" && version.submitted)
    .sort((a, b) => b.number - a.number)[0];

  return latest ? {
    ...latest,
    approvalStamp: latest.approvalStamp ? { ...latest.approvalStamp } : null,
    snapshot: cloneSnapshot(latest.snapshot),
  } : null;
}

export function findVersionByShareId(shareId: string): { projectId: string; version: EstimateV2Version } | null {
  const projects = getProjects();
  projects.forEach((project) => ensureProjectState(project.id));

  for (const [projectId, state] of statesByProjectId.entries()) {
    const matched = state.versions.find((version) => version.shareId === shareId);
    if (!matched) continue;
    return {
      projectId,
      version: {
        ...matched,
        approvalStamp: matched.approvalStamp ? { ...matched.approvalStamp } : null,
        snapshot: cloneSnapshot(matched.snapshot),
      },
    };
  }

  return null;
}

export function getLatestProposedVersion(projectId: string): EstimateV2Version | null {
  const state = ensureProjectState(projectId);
  const version = state.versions
    .filter((entry) => entry.status === "proposed" && entry.submitted)
    .sort((a, b) => b.number - a.number)[0];

  return version ? {
    ...version,
    approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
    snapshot: cloneSnapshot(version.snapshot),
  } : null;
}

export function computeVersionDiff(
  prevVersion: EstimateV2Version | null,
  nextVersion: EstimateV2Version,
): EstimateV2DiffResult {
  const prevSnapshot = prevVersion?.snapshot ?? null;
  const nextSnapshot = nextVersion.snapshot;

  const stageChanges = diffById(prevSnapshot?.stages ?? [], nextSnapshot.stages);
  const workChanges = diffById(prevSnapshot?.works ?? [], nextSnapshot.works);
  const lineChanges = diffById(prevSnapshot?.lines ?? [], nextSnapshot.lines);

  const prevStageById = mapById(prevSnapshot?.stages ?? []);
  const nextStageById = mapById(nextSnapshot.stages);
  const prevWorkById = mapById(prevSnapshot?.works ?? []);
  const nextWorkById = mapById(nextSnapshot.works);
  const prevLineById = mapById(prevSnapshot?.lines ?? []);
  const nextLineById = mapById(nextSnapshot.lines);

  const prevStageNumberById = buildStageNumberById(prevSnapshot?.stages ?? []);
  const nextStageNumberById = buildStageNumberById(nextSnapshot.stages);
  const prevWorkNumberById = buildWorkNumberById(prevSnapshot?.works ?? [], prevStageNumberById);
  const nextWorkNumberById = buildWorkNumberById(nextSnapshot.works, nextStageNumberById);

  const changes: EstimateV2StructuredChange[] = [];

  stageChanges.forEach((change) => {
    const prevStage = prevStageById.get(change.id);
    const nextStage = nextStageById.get(change.id);
    const source = change.type === "removed" ? prevStage : (nextStage ?? prevStage);
    if (!source) return;

    const fieldChanges: EstimateV2DiffFieldChange[] = [];
    if (change.type === "updated" && prevStage && nextStage) {
      pushFieldChange(fieldChanges, "title", "name", prevStage.title, nextStage.title);
    }

    changes.push({
      entityKind: "stage",
      entityId: source.id,
      changeType: change.type,
      stageId: source.id,
      stageTitle: source.title,
      workId: null,
      workTitle: null,
      title: source.title,
      stageNumber: change.type === "removed"
        ? (prevStageNumberById.get(source.id) ?? null)
        : (nextStageNumberById.get(source.id) ?? prevStageNumberById.get(source.id) ?? null),
      workNumber: null,
      fieldChanges,
    });
  });

  workChanges.forEach((change) => {
    const prevWork = prevWorkById.get(change.id);
    const nextWork = nextWorkById.get(change.id);
    const source = change.type === "removed" ? prevWork : (nextWork ?? prevWork);
    if (!source) return;

    const fieldChanges: EstimateV2DiffFieldChange[] = [];
    if (change.type === "updated" && prevWork && nextWork) {
      pushFieldChange(fieldChanges, "title", "name", prevWork.title, nextWork.title);
    }

    const stageId = source.stageId;
    const stageTitle = change.type === "removed"
      ? (prevStageById.get(stageId)?.title ?? nextStageById.get(stageId)?.title ?? null)
      : (nextStageById.get(stageId)?.title ?? prevStageById.get(stageId)?.title ?? null);
    changes.push({
      entityKind: "work",
      entityId: source.id,
      changeType: change.type,
      stageId,
      stageTitle,
      workId: source.id,
      workTitle: source.title,
      title: source.title,
      stageNumber: change.type === "removed"
        ? (prevStageNumberById.get(stageId) ?? null)
        : (nextStageNumberById.get(stageId) ?? prevStageNumberById.get(stageId) ?? null),
      workNumber: change.type === "removed"
        ? (prevWorkNumberById.get(source.id) ?? null)
        : (nextWorkNumberById.get(source.id) ?? prevWorkNumberById.get(source.id) ?? null),
      fieldChanges,
    });
  });

  lineChanges.forEach((change) => {
    const prevLine = prevLineById.get(change.id);
    const nextLine = nextLineById.get(change.id);
    const source = change.type === "removed" ? prevLine : (nextLine ?? prevLine);
    if (!source) return;

    const fieldChanges = change.type === "updated" && prevLine && nextLine
      ? buildLineFieldChanges(prevSnapshot, nextSnapshot, prevLine, nextLine)
      : [];

    const stageId = source.stageId;
    const workId = source.workId;
    const stageTitle = change.type === "removed"
      ? (prevStageById.get(stageId)?.title ?? nextStageById.get(stageId)?.title ?? null)
      : (nextStageById.get(stageId)?.title ?? prevStageById.get(stageId)?.title ?? null);
    const workTitle = change.type === "removed"
      ? (prevWorkById.get(workId)?.title ?? nextWorkById.get(workId)?.title ?? null)
      : (nextWorkById.get(workId)?.title ?? prevWorkById.get(workId)?.title ?? null);
    changes.push({
      entityKind: "line",
      entityId: source.id,
      changeType: change.type,
      stageId,
      stageTitle,
      workId,
      workTitle,
      title: source.title,
      stageNumber: change.type === "removed"
        ? (prevStageNumberById.get(stageId) ?? null)
        : (nextStageNumberById.get(stageId) ?? prevStageNumberById.get(stageId) ?? null),
      workNumber: change.type === "removed"
        ? (prevWorkNumberById.get(workId) ?? null)
        : (nextWorkNumberById.get(workId) ?? prevWorkNumberById.get(workId) ?? null),
      fieldChanges,
    });
  });

  return {
    stageChanges,
    workChanges,
    lineChanges,
    changedStageIds: stageChanges.map((change) => change.id),
    changedWorkIds: workChanges.map((change) => change.id),
    changedLineIds: lineChanges.map((change) => change.id),
    changes: changes.sort(structuredSort),
  };
}
