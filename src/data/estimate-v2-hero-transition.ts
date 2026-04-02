import { supabase } from "@/integrations/supabase/client";
import {
  getHeroTransitionEventById,
  getLatestHeroTransitionEvent,
  insertHeroTransitionEvent,
  type HeroTransitionEventPayload,
} from "@/data/activity-source";
import {
  clearEstimateV2HeroTransitionBlocked,
  clearEstimateV2HeroTransitionRecoveryState,
  loadEstimateV2HeroTransitionBlocked,
  loadEstimateV2HeroTransitionCache,
  saveEstimateV2HeroTransitionCompleted,
  saveEstimateV2HeroTransitionPending,
  type EstimateV2HeroTransitionIds,
} from "@/data/estimate-v2-transition-cache";
import {
  ensureEstimateCurrentVersion,
  ensureProjectEstimateRoot,
  loadCurrentEstimateDraft,
  resolveEstimateDraftRemoteIds,
  updateProjectEstimateRootStatus,
  upsertEstimateResourceLines,
  upsertEstimateWorks,
} from "@/data/estimate-source";
import {
  deleteHeroTaskChecklistItems,
  deleteHeroTasks,
  ensureProjectStages,
  loadHeroTaskChecklistItemsByEstimateWorkIds,
  loadHeroTasksForProject,
  upsertHeroTasks,
  upsertTaskChecklistItems,
} from "@/data/planning-source";
import {
  deleteHeroProcurementItems,
  loadHeroProcurementItemsByEstimateLineId,
  upsertHeroProcurementItems,
} from "@/data/procurement-source";
import {
  deleteHeroHRItems,
  resolveExistingHeroHRItemsByLineage,
  upsertHeroHRItems,
} from "@/data/hr-source";
import { resolveRuntimeWorkspaceMode } from "@/data/workspace-source";
import type { EstimateV2Snapshot, ResourceLineType } from "@/types/estimate-v2";

const RESOURCE_TYPE_ORDER: Record<ResourceLineType, number> = {
  material: 0,
  tool: 1,
  labor: 2,
  subcontractor: 3,
  other: 4,
};
const PARTIAL_REMOTE_TRANSITION_MESSAGE = "Estimate changed after a partial remote transition. Reload the page before trying again.";
const REMOTE_EVENT_MISMATCH_MESSAGE = "Remote hero-transition rows already exist for another estimate snapshot. Rovno will not create a second set.";

type HeroTransitionErrorCode =
  | "AUTH_REQUIRED"
  | "FINGERPRINT_MISMATCH"
  | "UNSAFE_REMOTE_ROWS"
  | "STAGE_ENSURE_FAILED"
  | "ESTIMATE_SNAPSHOT_FAILED"
  | "TASK_WRITE_FAILED"
  | "PROCUREMENT_WRITE_FAILED"
  | "HR_WRITE_FAILED"
  | "ACTIVITY_WRITE_FAILED";

export class EstimateV2HeroTransitionError extends Error {
  code: HeroTransitionErrorCode;
  blocking: boolean;

  constructor(code: HeroTransitionErrorCode, message: string, options?: { blocking?: boolean; cause?: unknown }) {
    super(message);
    this.name = "EstimateV2HeroTransitionError";
    this.code = code;
    this.blocking = options?.blocking ?? false;
    if (options?.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

export interface EstimateV2HeroTransitionStageInput {
  localStageId: string;
  title: string;
  order: number;
  discountBps: number;
}

export interface EstimateV2HeroTransitionWorkInput {
  localWorkId: string;
  localStageId: string;
  title: string;
  order: number;
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface EstimateV2HeroTransitionLineInput {
  localLineId: string;
  localStageId: string;
  localWorkId: string;
  title: string;
  type: ResourceLineType;
  unit: string;
  qtyMilli: number;
  costUnitCents: number;
}

export interface EstimateV2HeroTransitionInput {
  projectId: string;
  projectTitle: string;
  previousStatus: "planning" | "paused";
  autoScheduled: boolean;
  stages: EstimateV2HeroTransitionStageInput[];
  works: EstimateV2HeroTransitionWorkInput[];
  lines: EstimateV2HeroTransitionLineInput[];
}

export interface EstimateV2HeroTransitionResult {
  fingerprint: string;
  ids: EstimateV2HeroTransitionIds;
  profileId: string;
}

interface NormalizedTransitionPlan {
  projectId: string;
  projectTitle: string;
  previousStatus: "planning" | "paused";
  autoScheduled: boolean;
  stages: EstimateV2HeroTransitionStageInput[];
  works: EstimateV2HeroTransitionWorkInput[];
  lines: EstimateV2HeroTransitionLineInput[];
}

function deterministicHex(seed: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x811c9dc5;
  let hashC = 0x811c9dc5;
  let hashD = 0x811c9dc5;

  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + 17;
    hashB = Math.imul(hashB, 0x01000193);
    hashC ^= code + 31;
    hashC = Math.imul(hashC, 0x01000193);
    hashD ^= code + 47;
    hashD = Math.imul(hashD, 0x01000193);
  }

  return [hashA, hashB, hashC, hashD]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function deterministicUuid(seed: string): string {
  const hex = deterministicHex(`${seed}:a`) + deterministicHex(`${seed}:b`);
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  const variant = parseInt(chars[16], 16);
  chars[16] = ["8", "9", "a", "b"][variant % 4];
  const normalized = chars.join("");

  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

function quantityFromQtyMilli(qtyMilli: number): number {
  return Math.max(0, qtyMilli / 1_000);
}

function totalPriceCentsFromLine(line: EstimateV2HeroTransitionLineInput): number {
  return Math.max(0, Math.round(line.costUnitCents * quantityFromQtyMilli(line.qtyMilli)));
}

function resourceTypeForEstimateLine(type: ResourceLineType): "material" | "labor" | "equipment" | "other" {
  if (type === "material") return "material";
  if (type === "tool") return "equipment";
  if (type === "labor" || type === "subcontractor") return "labor";
  return "other";
}

function normalizePlan(input: EstimateV2HeroTransitionInput): NormalizedTransitionPlan {
  const stages = [...input.stages]
    .map((stage) => ({
      localStageId: stage.localStageId,
      title: stage.title,
      order: stage.order,
      discountBps: stage.discountBps,
    }))
    .sort((left, right) => left.order - right.order || left.localStageId.localeCompare(right.localStageId));

  const stageOrderByLocalId = new Map(stages.map((stage) => [stage.localStageId, stage.order]));

  const works = [...input.works]
    .map((work) => ({
      localWorkId: work.localWorkId,
      localStageId: work.localStageId,
      title: work.title,
      order: work.order,
      plannedStart: work.plannedStart,
      plannedEnd: work.plannedEnd,
    }))
    .sort((left, right) => {
      const stageOrderDiff = (stageOrderByLocalId.get(left.localStageId) ?? 0) - (stageOrderByLocalId.get(right.localStageId) ?? 0);
      if (stageOrderDiff !== 0) return stageOrderDiff;
      if (left.order !== right.order) return left.order - right.order;
      return left.localWorkId.localeCompare(right.localWorkId);
    });

  const workOrderByLocalId = new Map(works.map((work, index) => [work.localWorkId, index]));
  const lines = [...input.lines]
    .map((line) => ({
      localLineId: line.localLineId,
      localStageId: line.localStageId,
      localWorkId: line.localWorkId,
      title: line.title,
      type: line.type,
      unit: line.unit,
      qtyMilli: line.qtyMilli,
      costUnitCents: line.costUnitCents,
    }))
    .sort((left, right) => {
      const workOrderDiff = (workOrderByLocalId.get(left.localWorkId) ?? 0) - (workOrderByLocalId.get(right.localWorkId) ?? 0);
      if (workOrderDiff !== 0) return workOrderDiff;
      const resourceTypeDiff = RESOURCE_TYPE_ORDER[left.type] - RESOURCE_TYPE_ORDER[right.type];
      if (resourceTypeDiff !== 0) return resourceTypeDiff;
      return left.localLineId.localeCompare(right.localLineId);
    });

  return {
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    previousStatus: input.previousStatus,
    autoScheduled: input.autoScheduled,
    stages,
    works,
    lines,
  };
}

function buildFingerprint(plan: NormalizedTransitionPlan): string {
  return deterministicUuid(`estimate-v2-hero-transition:fingerprint:${JSON.stringify(plan)}`);
}

function buildIds(
  plan: NormalizedTransitionPlan,
  fingerprint: string,
  draftIds: ReturnType<typeof resolveEstimateDraftRemoteIds>,
): EstimateV2HeroTransitionIds {
  return {
    estimateId: draftIds.estimateId,
    versionId: draftIds.versionId,
    eventId: deterministicUuid(`activity-event:${plan.projectId}:${fingerprint}:hero-transition`),
    stageIdByLocalStageId: { ...draftIds.stageIdByLocalStageId },
    workIdByLocalWorkId: { ...draftIds.workIdByLocalWorkId },
    lineIdByLocalLineId: { ...draftIds.lineIdByLocalLineId },
    taskIdByLocalWorkId: Object.fromEntries(plan.works.map((work) => [
      work.localWorkId,
      deterministicUuid(`task:${plan.projectId}:${fingerprint}:${work.localWorkId}`),
    ])),
    checklistItemIdByLocalLineId: Object.fromEntries(plan.lines.map((line) => [
      line.localLineId,
      deterministicUuid(`task-checklist-item:${plan.projectId}:${fingerprint}:${line.localLineId}`),
    ])),
    procurementItemIdByLocalLineId: Object.fromEntries(
      plan.lines
        .filter((line) => line.type === "material" || line.type === "tool")
        .map((line) => [
          line.localLineId,
          deterministicUuid(`procurement-item:${plan.projectId}:${fingerprint}:${line.localLineId}`),
        ]),
    ),
    hrItemIdByLocalLineId: Object.fromEntries(
      plan.lines
        .filter((line) => line.type === "labor" || line.type === "subcontractor")
        .map((line) => [
          line.localLineId,
          deterministicUuid(`hr-item:${plan.projectId}:${fingerprint}:${line.localLineId}`),
        ]),
    ),
  };
}

function buildDraftResolutionSnapshot(plan: NormalizedTransitionPlan): Pick<
  EstimateV2Snapshot,
  "project" | "stages" | "works" | "lines" | "dependencies"
> {
  return {
    project: {
      id: plan.projectId,
    } as EstimateV2Snapshot["project"],
    stages: plan.stages.map((stage) => ({
      id: stage.localStageId,
      title: stage.title,
      order: stage.order,
      discountBps: stage.discountBps,
    })) as EstimateV2Snapshot["stages"],
    works: plan.works.map((work) => ({
      id: work.localWorkId,
      stageId: work.localStageId,
      title: work.title,
      order: work.order,
      plannedStart: work.plannedStart,
      plannedEnd: work.plannedEnd,
    })) as EstimateV2Snapshot["works"],
    lines: plan.lines.map((line) => ({
      id: line.localLineId,
      stageId: line.localStageId,
      workId: line.localWorkId,
      title: line.title,
      type: line.type,
      unit: line.unit,
      qtyMilli: line.qtyMilli,
      costUnitCents: line.costUnitCents,
    })) as EstimateV2Snapshot["lines"],
    dependencies: [],
  };
}

function stepFailureMessage(base: string, error: unknown): string {
  if (!(error instanceof Error) || !error.message) {
    return base;
  }

  return `${base} ${error.message}`;
}

function resolveTaskIdsFromChecklist(
  plan: NormalizedTransitionPlan,
  ids: EstimateV2HeroTransitionIds,
  checklistRows: Awaited<ReturnType<typeof loadHeroTaskChecklistItemsByEstimateWorkIds>>,
): Record<string, string> {
  const nextTaskIds = { ...ids.taskIdByLocalWorkId };

  plan.works.forEach((work) => {
    const resolvedWorkId = ids.workIdByLocalWorkId[work.localWorkId];
    const taskIds = uniqueIds(
      checklistRows
        .filter((row) => row.estimate_work_id === resolvedWorkId)
        .map((row) => row.task_id),
    );

    if (taskIds.length > 1) {
      throw new Error(`Ambiguous remote task mapping for "${work.title}"`);
    }

    if (taskIds[0]) {
      nextTaskIds[work.localWorkId] = taskIds[0];
    }
  });

  return nextTaskIds;
}

function resolveChecklistItemIds(
  plan: NormalizedTransitionPlan,
  ids: EstimateV2HeroTransitionIds,
  checklistRows: Awaited<ReturnType<typeof loadHeroTaskChecklistItemsByEstimateWorkIds>>,
): Record<string, string> {
  const nextChecklistIds = { ...ids.checklistItemIdByLocalLineId };

  plan.lines.forEach((line) => {
    const resolvedLineId = ids.lineIdByLocalLineId[line.localLineId];
    const matches = checklistRows.filter((row) => row.estimate_resource_line_id === resolvedLineId);

    if (matches.length > 1) {
      throw new Error(`Ambiguous remote checklist mapping for "${line.title}"`);
    }

    if (matches[0]) {
      nextChecklistIds[line.localLineId] = matches[0].id;
    }
  });

  return nextChecklistIds;
}

function createTransitionPayload(
  fingerprint: string,
  previousStatus: "planning" | "paused",
  autoScheduled: boolean,
  ids: EstimateV2HeroTransitionIds,
): HeroTransitionEventPayload {
  return {
    source: "estimate_v2.hero_transition",
    fingerprint,
    previousStatus,
    nextStatus: "in_work",
    autoScheduled,
    ids,
  };
}

function isRecoverableBlockedReason(reason: string): boolean {
  return reason.includes(PARTIAL_REMOTE_TRANSITION_MESSAGE)
    || reason.includes(REMOTE_EVENT_MISMATCH_MESSAGE)
    || reason.includes("Remote estimate snapshot rows already exist")
    || reason.includes("Remote estimate version rows already exist");
}

function mergeDownstreamIds(
  plan: NormalizedTransitionPlan,
  ids: EstimateV2HeroTransitionIds,
  source: EstimateV2HeroTransitionIds | null,
): EstimateV2HeroTransitionIds {
  if (!source) return ids;

  const nextIds: EstimateV2HeroTransitionIds = {
    ...ids,
    eventId: source.eventId || ids.eventId,
    stageIdByLocalStageId: { ...ids.stageIdByLocalStageId },
    workIdByLocalWorkId: { ...ids.workIdByLocalWorkId },
    lineIdByLocalLineId: { ...ids.lineIdByLocalLineId },
    taskIdByLocalWorkId: { ...ids.taskIdByLocalWorkId },
    checklistItemIdByLocalLineId: { ...ids.checklistItemIdByLocalLineId },
    procurementItemIdByLocalLineId: { ...ids.procurementItemIdByLocalLineId },
    hrItemIdByLocalLineId: { ...ids.hrItemIdByLocalLineId },
  };

  plan.works.forEach((work) => {
    const taskId = source.taskIdByLocalWorkId[work.localWorkId];
    if (taskId) {
      nextIds.taskIdByLocalWorkId[work.localWorkId] = taskId;
    }
  });

  plan.lines.forEach((line) => {
    const checklistItemId = source.checklistItemIdByLocalLineId[line.localLineId];
    if (checklistItemId) {
      nextIds.checklistItemIdByLocalLineId[line.localLineId] = checklistItemId;
    }

    if (line.type === "material" || line.type === "tool") {
      const procurementItemId = source.procurementItemIdByLocalLineId[line.localLineId];
      if (procurementItemId) {
        nextIds.procurementItemIdByLocalLineId[line.localLineId] = procurementItemId;
      }
    }

    if (line.type === "labor" || line.type === "subcontractor") {
      const hrItemId = source.hrItemIdByLocalLineId[line.localLineId];
      if (hrItemId) {
        nextIds.hrItemIdByLocalLineId[line.localLineId] = hrItemId;
      }
    }
  });

  return nextIds;
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return Array.from(new Set(ids.filter((value): value is string => Boolean(value))));
}

function collectStaleDownstreamIds(
  plan: NormalizedTransitionPlan,
  staleIds: EstimateV2HeroTransitionIds | null,
): {
  checklistItemIds: string[];
  procurementItemIds: string[];
  hrItemIds: string[];
  taskIds: string[];
} {
  if (!staleIds) {
    return {
      checklistItemIds: [],
      procurementItemIds: [],
      hrItemIds: [],
      taskIds: [],
    };
  }

  const currentWorkIds = new Set(plan.works.map((work) => work.localWorkId));
  const currentLineIds = new Set(plan.lines.map((line) => line.localLineId));
  const currentProcurementLineIds = new Set(
    plan.lines
      .filter((line) => line.type === "material" || line.type === "tool")
      .map((line) => line.localLineId),
  );
  const currentHrLineIds = new Set(
    plan.lines
      .filter((line) => line.type === "labor" || line.type === "subcontractor")
      .map((line) => line.localLineId),
  );

  return {
    checklistItemIds: uniqueIds(
      Object.entries(staleIds.checklistItemIdByLocalLineId)
        .filter(([localLineId]) => !currentLineIds.has(localLineId))
        .map(([, checklistItemId]) => checklistItemId),
    ),
    procurementItemIds: uniqueIds(
      Object.entries(staleIds.procurementItemIdByLocalLineId)
        .filter(([localLineId]) => !currentProcurementLineIds.has(localLineId))
        .map(([, procurementItemId]) => procurementItemId),
    ),
    hrItemIds: uniqueIds(
      Object.entries(staleIds.hrItemIdByLocalLineId)
        .filter(([localLineId]) => !currentHrLineIds.has(localLineId))
        .map(([, hrItemId]) => hrItemId),
    ),
    taskIds: uniqueIds(
      Object.entries(staleIds.taskIdByLocalWorkId)
        .filter(([localWorkId]) => !currentWorkIds.has(localWorkId))
        .map(([, taskId]) => taskId),
    ),
  };
}

async function cleanupStaleDownstreamRows(
  staleIds: {
    checklistItemIds: string[];
    procurementItemIds: string[];
    hrItemIds: string[];
    taskIds: string[];
  },
): Promise<void> {
  await deleteHeroTaskChecklistItems(supabase, staleIds.checklistItemIds);
  await deleteHeroProcurementItems(supabase, staleIds.procurementItemIds);
  await deleteHeroHRItems(supabase, staleIds.hrItemIds);
  await deleteHeroTasks(supabase, staleIds.taskIds);
}

export async function persistEstimateV2HeroTransition(
  input: EstimateV2HeroTransitionInput,
): Promise<EstimateV2HeroTransitionResult> {
  const mode = await resolveRuntimeWorkspaceMode();
  if (mode.kind !== "supabase") {
    throw new EstimateV2HeroTransitionError(
      "AUTH_REQUIRED",
      "An authenticated Supabase session is required before moving the estimate to In work.",
    );
  }

  const plan = normalizePlan(input);
  const fingerprint = buildFingerprint(plan);
  const blocked = loadEstimateV2HeroTransitionBlocked(plan.projectId);
  if (blocked && isRecoverableBlockedReason(blocked.reason)) {
    clearEstimateV2HeroTransitionBlocked(plan.projectId);
  }

  let cache = loadEstimateV2HeroTransitionCache(plan.projectId);
  if (cache?.status === "completed" && cache.fingerprint !== fingerprint) {
    clearEstimateV2HeroTransitionRecoveryState(plan.projectId);
    cache = null;
  }

  const completedCache = cache?.status === "completed" && cache.fingerprint === fingerprint
    ? cache
    : null;
  const pendingCache = cache?.status === "pending" ? cache : null;
  const existingDraft = await loadCurrentEstimateDraft(plan.projectId);
  const draftIds = resolveEstimateDraftRemoteIds({
    projectId: plan.projectId,
    snapshot: buildDraftResolutionSnapshot(plan),
    existingDraft,
  });
  let ids = buildIds(plan, fingerprint, draftIds);

  const exactEvent = await getHeroTransitionEventById(supabase, ids.eventId);
  const latestEvent = exactEvent
    ? null
    : await getLatestHeroTransitionEvent(supabase, plan.projectId);
  const eventRecoveryIds = exactEvent?.payload.ids
    ?? (latestEvent?.payload.fingerprint === fingerprint ? latestEvent.payload.ids : null);

  ids = mergeDownstreamIds(plan, ids, completedCache?.ids ?? null);
  ids = mergeDownstreamIds(plan, ids, pendingCache?.ids ?? null);
  ids = mergeDownstreamIds(plan, ids, eventRecoveryIds);

  const staleDownstreamIds = pendingCache && pendingCache.fingerprint !== fingerprint
    ? collectStaleDownstreamIds(plan, pendingCache.ids)
    : {
      checklistItemIds: [],
      procurementItemIds: [],
      hrItemIds: [],
      taskIds: [],
    };

  saveEstimateV2HeroTransitionPending({
    projectId: plan.projectId,
    fingerprint,
    ids,
  });

  try {
    const stageMapping = await ensureProjectStages(
      supabase,
      plan.stages.map((stage) => ({
        localStageId: stage.localStageId,
        remoteStageId: ids.stageIdByLocalStageId[stage.localStageId],
        projectId: plan.projectId,
        title: stage.title,
        order: stage.order,
        status: "open",
        discountBps: stage.discountBps,
      })),
    );

    ids = {
      ...ids,
      stageIdByLocalStageId: stageMapping,
    };

    saveEstimateV2HeroTransitionPending({
      projectId: plan.projectId,
      fingerprint,
      ids,
    });
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "STAGE_ENSURE_FAILED",
      stepFailureMessage(
        "Stage reconciliation failed in Supabase. Some remote rows may already exist. Retry will resume reconciliation.",
        error,
      ),
      { cause: error },
    );
  }

  try {
    const rootResult = await ensureProjectEstimateRoot(supabase, {
      projectId: plan.projectId,
      estimateId: ids.estimateId,
      title: plan.projectTitle,
      createdBy: mode.profileId,
    });

    if (!rootResult.ok) {
      throw new EstimateV2HeroTransitionError(
        "ESTIMATE_SNAPSHOT_FAILED",
        "Estimate snapshot reconciliation failed in Supabase. Some remote rows may already exist. Retry will resume reconciliation.",
      );
    }

    const versionResult = await ensureEstimateCurrentVersion(supabase, {
      estimateId: ids.estimateId,
      versionId: ids.versionId,
      createdBy: mode.profileId,
    });

    if (!versionResult.ok) {
      throw new EstimateV2HeroTransitionError(
        "ESTIMATE_SNAPSHOT_FAILED",
        "Estimate snapshot reconciliation failed in Supabase. Some remote rows may already exist. Retry will resume reconciliation.",
      );
    }

    const lineIdsByWorkId = new Map<string, EstimateV2HeroTransitionLineInput[]>();
    plan.lines.forEach((line) => {
      const list = lineIdsByWorkId.get(line.localWorkId) ?? [];
      list.push(line);
      lineIdsByWorkId.set(line.localWorkId, list);
    });

    await upsertEstimateWorks(
      supabase,
      plan.works.map((work) => ({
        id: ids.workIdByLocalWorkId[work.localWorkId],
        estimate_version_id: ids.versionId,
        project_stage_id: ids.stageIdByLocalStageId[work.localStageId] ?? null,
        title: work.title,
        description: null,
        sort_order: work.order,
        planned_cost_cents: (lineIdsByWorkId.get(work.localWorkId) ?? [])
          .reduce((sum, line) => sum + totalPriceCentsFromLine(line), 0),
      })),
    );

    await upsertEstimateResourceLines(
      supabase,
      plan.lines.map((line) => ({
        id: ids.lineIdByLocalLineId[line.localLineId],
        estimate_work_id: ids.workIdByLocalWorkId[line.localWorkId],
        resource_type: resourceTypeForEstimateLine(line.type),
        title: line.title,
        quantity: quantityFromQtyMilli(line.qtyMilli),
        unit: line.unit,
        unit_price_cents: line.costUnitCents,
        total_price_cents: totalPriceCentsFromLine(line),
      })),
    );

    await updateProjectEstimateRootStatus(supabase, {
      estimateId: ids.estimateId,
      status: "approved",
    });
  } catch (error) {
    if (error instanceof EstimateV2HeroTransitionError) {
      throw error;
    }

    throw new EstimateV2HeroTransitionError(
      "ESTIMATE_SNAPSHOT_FAILED",
      stepFailureMessage(
        "Estimate snapshot reconciliation failed in Supabase. Some remote rows may already exist. Retry will resume reconciliation.",
        error,
      ),
      { cause: error },
    );
  }

  try {
    await cleanupStaleDownstreamRows(staleDownstreamIds);

    const [taskRows, checklistRows] = await Promise.all([
      loadHeroTasksForProject(supabase, plan.projectId),
      loadHeroTaskChecklistItemsByEstimateWorkIds(
        supabase,
        Object.values(ids.workIdByLocalWorkId),
      ),
    ]);
    const nextTaskIds = resolveTaskIdsFromChecklist(plan, ids, checklistRows);
    const nextChecklistIds = resolveChecklistItemIds(plan, {
      ...ids,
      taskIdByLocalWorkId: nextTaskIds,
    }, checklistRows);
    ids = {
      ...ids,
      taskIdByLocalWorkId: nextTaskIds,
      checklistItemIdByLocalLineId: nextChecklistIds,
    };

    saveEstimateV2HeroTransitionPending({
      projectId: plan.projectId,
      fingerprint,
      ids,
    });

    const existingTaskRowById = new Map(taskRows.map((row) => [row.id, row]));

    await upsertHeroTasks(
      supabase,
      plan.works.map((work) => ({
        id: ids.taskIdByLocalWorkId[work.localWorkId],
        projectId: plan.projectId,
        stageId: ids.stageIdByLocalStageId[work.localStageId],
        title: work.title,
        description: existingTaskRowById.get(ids.taskIdByLocalWorkId[work.localWorkId])?.description
          ?? "Auto-created from Estimate v2 work",
        status: existingTaskRowById.get(ids.taskIdByLocalWorkId[work.localWorkId])?.status
          ?? "not_started",
        assigneeId: existingTaskRowById.get(ids.taskIdByLocalWorkId[work.localWorkId])?.assignee_profile_id
          ?? mode.profileId,
        createdBy: existingTaskRowById.get(ids.taskIdByLocalWorkId[work.localWorkId])?.created_by
          ?? mode.profileId,
        startAt: work.plannedStart,
        dueAt: work.plannedEnd,
      })),
    );

    const sortedLinesByWorkId = new Map<string, EstimateV2HeroTransitionLineInput[]>();
    plan.lines.forEach((line) => {
      const list = sortedLinesByWorkId.get(line.localWorkId) ?? [];
      list.push(line);
      sortedLinesByWorkId.set(line.localWorkId, list);
    });

    await upsertTaskChecklistItems(
      supabase,
      plan.works.flatMap((work) => (
        (sortedLinesByWorkId.get(work.localWorkId) ?? []).map((line, index) => {
          const existingChecklistRow = checklistRows.find((row) => (
            row.id === ids.checklistItemIdByLocalLineId[line.localLineId]
          )) ?? null;
          return {
            id: ids.checklistItemIdByLocalLineId[line.localLineId],
            taskId: ids.taskIdByLocalWorkId[work.localWorkId],
            title: line.title,
            isDone: existingChecklistRow?.is_done ?? false,
            procurementItemId: existingChecklistRow?.procurement_item_id ?? null,
            estimateResourceLineId: ids.lineIdByLocalLineId[line.localLineId],
            estimateWorkId: ids.workIdByLocalWorkId[work.localWorkId],
            sortOrder: index + 1,
          };
        })
      )),
    );
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "TASK_WRITE_FAILED",
      stepFailureMessage(
        "Task reconciliation failed in Supabase. Some task rows may already exist. Retry will resume reconciliation.",
        error,
      ),
      { cause: error },
    );
  }

  try {
    const existingProcurementByEstimateLineId = await loadHeroProcurementItemsByEstimateLineId(supabase, {
      projectId: plan.projectId,
      estimateResourceLineIds: plan.lines.map((line) => ids.lineIdByLocalLineId[line.localLineId]),
    });

    ids = {
      ...ids,
      procurementItemIdByLocalLineId: {
        ...ids.procurementItemIdByLocalLineId,
        ...Object.fromEntries(plan.lines
          .filter((line) => line.type === "material" || line.type === "tool")
          .flatMap((line) => {
            const existingRow = existingProcurementByEstimateLineId.get(ids.lineIdByLocalLineId[line.localLineId]);
            return existingRow ? [[line.localLineId, existingRow.id]] : [];
          })),
      },
    };

    saveEstimateV2HeroTransitionPending({
      projectId: plan.projectId,
      fingerprint,
      ids,
    });

    await upsertHeroProcurementItems(
      supabase,
      plan.lines
        .filter((line) => line.type === "material" || line.type === "tool")
        .map((line) => {
          const existingRow = existingProcurementByEstimateLineId.get(ids.lineIdByLocalLineId[line.localLineId]) ?? null;
          return {
            id: ids.procurementItemIdByLocalLineId[line.localLineId],
            projectId: plan.projectId,
            estimateResourceLineId: ids.lineIdByLocalLineId[line.localLineId],
            taskId: ids.taskIdByLocalWorkId[line.localWorkId],
            title: line.title,
            description: existingRow?.description ?? null,
            category: existingRow?.category ?? null,
            quantity: quantityFromQtyMilli(line.qtyMilli),
            unit: line.unit,
            plannedUnitPriceCents: line.costUnitCents,
            plannedTotalPriceCents: totalPriceCentsFromLine(line),
            status: existingRow?.status ?? "requested",
            createdBy: existingRow?.createdBy ?? mode.profileId,
          };
        }),
    );
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "PROCUREMENT_WRITE_FAILED",
      stepFailureMessage(
        "Procurement reconciliation failed in Supabase. Some procurement rows may already exist. Retry will resume reconciliation.",
        error,
      ),
      { cause: error },
    );
  }

  try {
    const workByLocalId = new Map(plan.works.map((work) => [work.localWorkId, work]));
    const existingHrRowsByLocalLineId = await resolveExistingHeroHRItemsByLineage(supabase, {
      projectId: plan.projectId,
      items: plan.lines
        .filter((line) => line.type === "labor" || line.type === "subcontractor")
        .map((line) => ({
          localLineId: line.localLineId,
          estimateResourceLineId: ids.lineIdByLocalLineId[line.localLineId],
          estimateWorkId: ids.workIdByLocalWorkId[line.localWorkId] ?? null,
          taskId: ids.taskIdByLocalWorkId[line.localWorkId] ?? null,
          title: line.title,
          knownHrItemId: ids.hrItemIdByLocalLineId[line.localLineId] ?? null,
        })),
    });

    ids = {
      ...ids,
      hrItemIdByLocalLineId: {
        ...ids.hrItemIdByLocalLineId,
        ...Object.fromEntries(Array.from(existingHrRowsByLocalLineId.entries()).map(([localLineId, row]) => [
          localLineId,
          row.id,
        ])),
      },
    };

    saveEstimateV2HeroTransitionPending({
      projectId: plan.projectId,
      fingerprint,
      ids,
    });

    await upsertHeroHRItems(
      supabase,
      plan.lines
        .filter((line) => line.type === "labor" || line.type === "subcontractor")
        .map((line) => {
          const parentWork = workByLocalId.get(line.localWorkId);
          const existingRow = existingHrRowsByLocalLineId.get(line.localLineId) ?? null;
          return {
            id: ids.hrItemIdByLocalLineId[line.localLineId],
            projectId: plan.projectId,
            projectStageId: ids.stageIdByLocalStageId[line.localStageId] ?? null,
            estimateResourceLineId: ids.lineIdByLocalLineId[line.localLineId],
            estimateWorkId: ids.workIdByLocalWorkId[line.localWorkId] ?? null,
            taskId: ids.taskIdByLocalWorkId[line.localWorkId] ?? null,
            title: line.title,
            description: existingRow?.description ?? null,
            compensationType: existingRow?.compensationType ?? "fixed",
            plannedCostCents: totalPriceCentsFromLine(line),
            actualCostCents: existingRow?.actualCostCents ?? null,
            status: existingRow?.status ?? "planned",
            startAt: parentWork?.plannedStart ?? existingRow?.startAt ?? null,
            endAt: parentWork?.plannedEnd ?? existingRow?.endAt ?? null,
            createdBy: existingRow?.createdBy ?? mode.profileId,
          };
        }),
    );
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "HR_WRITE_FAILED",
      stepFailureMessage(
        "HR reconciliation failed in Supabase. Some HR rows may already exist. Retry will resume reconciliation.",
        error,
      ),
      { cause: error },
    );
  }

  try {
    await insertHeroTransitionEvent(supabase, {
      id: ids.eventId,
      projectId: plan.projectId,
      actorProfileId: mode.profileId,
      entityId: ids.estimateId,
      payload: createTransitionPayload(fingerprint, plan.previousStatus, plan.autoScheduled, ids),
    });
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "ACTIVITY_WRITE_FAILED",
      stepFailureMessage(
        "Activity reconciliation failed in Supabase. Some remote rows may already exist. Retry will resume reconciliation.",
        error,
      ),
      { cause: error },
    );
  }

  saveEstimateV2HeroTransitionCompleted({
    projectId: plan.projectId,
    fingerprint,
    ids,
  });

  return {
    fingerprint,
    ids,
    profileId: mode.profileId,
  };
}
