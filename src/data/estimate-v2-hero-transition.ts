import { supabase } from "@/integrations/supabase/client";
import {
  getLatestHeroTransitionEvent,
  insertHeroTransitionEvent,
  type HeroTransitionEventPayload,
} from "@/data/activity-source";
import {
  loadEstimateV2HeroTransitionBlocked,
  loadEstimateV2HeroTransitionCache,
  saveEstimateV2HeroTransitionBlocked,
  saveEstimateV2HeroTransitionCompleted,
  saveEstimateV2HeroTransitionPending,
  type EstimateV2HeroTransitionIds,
} from "@/data/estimate-v2-transition-cache";
import {
  ensureEstimateCurrentVersion,
  ensureProjectEstimateRoot,
  upsertEstimateResourceLines,
  upsertEstimateWorks,
} from "@/data/estimate-source";
import {
  ensureProjectStages,
  upsertHeroTasks,
  upsertTaskChecklistItems,
} from "@/data/planning-source";
import { upsertHeroProcurementItems } from "@/data/procurement-source";
import { upsertHeroHRItems } from "@/data/hr-source";
import { resolveRuntimeWorkspaceMode } from "@/data/workspace-source";
import type { ResourceLineType } from "@/types/estimate-v2";

const RESOURCE_TYPE_ORDER: Record<ResourceLineType, number> = {
  material: 0,
  tool: 1,
  labor: 2,
  subcontractor: 3,
  other: 4,
};

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
    autoScheduled: input.autoScheduled,
    stages,
    works,
    lines,
  };
}

function buildFingerprint(plan: NormalizedTransitionPlan): string {
  return deterministicUuid(`estimate-v2-hero-transition:fingerprint:${JSON.stringify(plan)}`);
}

function buildIds(plan: NormalizedTransitionPlan, fingerprint: string): EstimateV2HeroTransitionIds {
  return {
    estimateId: deterministicUuid(`project-estimate:${plan.projectId}`),
    versionId: deterministicUuid(`estimate-version:${plan.projectId}:current`),
    eventId: deterministicUuid(`activity-event:${plan.projectId}:${fingerprint}:hero-transition`),
    stageIdByLocalStageId: Object.fromEntries(plan.stages.map((stage) => [
      stage.localStageId,
      deterministicUuid(`project-stage:${plan.projectId}:${stage.localStageId}`),
    ])),
    workIdByLocalWorkId: Object.fromEntries(plan.works.map((work) => [
      work.localWorkId,
      deterministicUuid(`estimate-work:${plan.projectId}:${fingerprint}:${work.localWorkId}`),
    ])),
    lineIdByLocalLineId: Object.fromEntries(plan.lines.map((line) => [
      line.localLineId,
      deterministicUuid(`estimate-line:${plan.projectId}:${fingerprint}:${line.localLineId}`),
    ])),
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

function createTransitionPayload(
  fingerprint: string,
  autoScheduled: boolean,
  ids: EstimateV2HeroTransitionIds,
): HeroTransitionEventPayload {
  return {
    source: "estimate_v2.hero_transition",
    fingerprint,
    previousStatus: "planning",
    nextStatus: "in_work",
    autoScheduled,
    ids,
  };
}

function blockTransition(projectId: string, fingerprint: string, message: string): never {
  saveEstimateV2HeroTransitionBlocked({
    projectId,
    fingerprint,
    reason: message,
  });
  throw new EstimateV2HeroTransitionError("UNSAFE_REMOTE_ROWS", message, { blocking: true });
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
  if (blocked) {
    throw new EstimateV2HeroTransitionError("UNSAFE_REMOTE_ROWS", blocked.reason, { blocking: true });
  }

  const cache = loadEstimateV2HeroTransitionCache(plan.projectId);
  if (cache && cache.fingerprint !== fingerprint) {
    blockTransition(
      plan.projectId,
      fingerprint,
      "Estimate changed after a partial remote transition. Reload the page before trying again.",
    );
  }

  if (cache?.status === "completed") {
    return {
      fingerprint,
      ids: cache.ids,
      profileId: mode.profileId,
    };
  }

  const latestEvent = await getLatestHeroTransitionEvent(supabase, plan.projectId);
  if (latestEvent && latestEvent.payload.fingerprint !== fingerprint) {
    blockTransition(
      plan.projectId,
      fingerprint,
      "Remote hero-transition rows already exist for another estimate snapshot. Rovno will not create a second set.",
    );
  }

  let ids = cache?.ids ?? buildIds(plan, fingerprint);
  if (latestEvent?.payload.fingerprint === fingerprint) {
    ids = latestEvent.payload.ids;
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
      "Could not sync project stages to Supabase. Estimate status was not changed.",
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
      blockTransition(
        plan.projectId,
        fingerprint,
        "Remote estimate snapshot rows already exist but cannot be matched safely. Rovno will not create a second set.",
      );
    }

    const versionResult = await ensureEstimateCurrentVersion(supabase, {
      estimateId: ids.estimateId,
      versionId: ids.versionId,
      createdBy: mode.profileId,
    });

    if (!versionResult.ok) {
      blockTransition(
        plan.projectId,
        fingerprint,
        "Remote estimate version rows already exist but cannot be matched safely. Rovno will not create a second set.",
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
  } catch (error) {
    if (error instanceof EstimateV2HeroTransitionError) {
      throw error;
    }

    throw new EstimateV2HeroTransitionError(
      "ESTIMATE_SNAPSHOT_FAILED",
      "Estimate snapshot did not finish saving to Supabase. Retry the transition.",
      { cause: error },
    );
  }

  try {
    await upsertHeroTasks(
      supabase,
      plan.works.map((work) => ({
        id: ids.taskIdByLocalWorkId[work.localWorkId],
        projectId: plan.projectId,
        stageId: ids.stageIdByLocalStageId[work.localStageId],
        title: work.title,
        description: "Auto-created from Estimate v2 work",
        status: "not_started",
        assigneeId: mode.profileId,
        createdBy: mode.profileId,
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
        (sortedLinesByWorkId.get(work.localWorkId) ?? []).map((line, index) => ({
          id: ids.checklistItemIdByLocalLineId[line.localLineId],
          taskId: ids.taskIdByLocalWorkId[work.localWorkId],
          title: line.title,
          isDone: false,
          procurementItemId: null,
          estimateResourceLineId: ids.lineIdByLocalLineId[line.localLineId],
          estimateWorkId: ids.workIdByLocalWorkId[work.localWorkId],
          sortOrder: index + 1,
        }))
      )),
    );
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "TASK_WRITE_FAILED",
      "Task generation did not finish saving to Supabase. Estimate status was not changed.",
      { cause: error },
    );
  }

  try {
    await upsertHeroProcurementItems(
      supabase,
      plan.lines
        .filter((line) => line.type === "material" || line.type === "tool")
        .map((line) => ({
          id: ids.procurementItemIdByLocalLineId[line.localLineId],
          projectId: plan.projectId,
          estimateResourceLineId: ids.lineIdByLocalLineId[line.localLineId],
          taskId: ids.taskIdByLocalWorkId[line.localWorkId],
          title: line.title,
          description: null,
          category: null,
          quantity: quantityFromQtyMilli(line.qtyMilli),
          unit: line.unit,
          plannedUnitPriceCents: line.costUnitCents,
          plannedTotalPriceCents: totalPriceCentsFromLine(line),
          status: "requested",
          createdBy: mode.profileId,
        })),
    );
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "PROCUREMENT_WRITE_FAILED",
      "Procurement items did not finish saving to Supabase. Retry the transition.",
      { cause: error },
    );
  }

  try {
    const workByLocalId = new Map(plan.works.map((work) => [work.localWorkId, work]));
    await upsertHeroHRItems(
      supabase,
      plan.lines
        .filter((line) => line.type === "labor" || line.type === "subcontractor")
        .map((line) => {
          const parentWork = workByLocalId.get(line.localWorkId);
          return {
            id: ids.hrItemIdByLocalLineId[line.localLineId],
            projectId: plan.projectId,
            projectStageId: ids.stageIdByLocalStageId[line.localStageId] ?? null,
            estimateWorkId: ids.workIdByLocalWorkId[line.localWorkId] ?? null,
            taskId: ids.taskIdByLocalWorkId[line.localWorkId] ?? null,
            title: line.title,
            description: null,
            compensationType: "fixed" as const,
            plannedCostCents: totalPriceCentsFromLine(line),
            actualCostCents: null,
            status: "planned" as const,
            startAt: parentWork?.plannedStart ?? null,
            endAt: parentWork?.plannedEnd ?? null,
            createdBy: mode.profileId,
          };
        }),
    );
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "HR_WRITE_FAILED",
      "HR items did not finish saving to Supabase. Retry the transition.",
      { cause: error },
    );
  }

  try {
    await insertHeroTransitionEvent(supabase, {
      id: ids.eventId,
      projectId: plan.projectId,
      actorProfileId: mode.profileId,
      entityId: ids.estimateId,
      payload: createTransitionPayload(fingerprint, plan.autoScheduled, ids),
    });
  } catch (error) {
    throw new EstimateV2HeroTransitionError(
      "ACTIVITY_WRITE_FAILED",
      "The transition did not complete and must be retried.",
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
