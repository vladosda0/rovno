import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestHeroTransitionEvent } from "@/data/activity-source";
import { loadEstimateV2HeroTransitionCache } from "@/data/estimate-v2-transition-cache";
import {
  addPayment,
  getHRItems,
  getHRPayments,
  HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE,
  setHRAssignees,
  setStatus,
} from "@/data/hr-store";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { FinanceRowLoadAccess } from "@/lib/permissions";
import type { EstimateExecutionStatus, EstimateV2ResourceLine, EstimateV2Work } from "@/types/estimate-v2";
import type { HRItemStatus, HRItemType, HRPayment, HRPlannedItem } from "@/types/hr";
import { projectToHrItemType, type DbEstimateResourceType } from "@/lib/estimate-v2/resource-type-contract";
import type { Database as HRDatabase } from "../../backend-truth/generated/supabase-types";

type HRItemRow = HRDatabase["public"]["Tables"]["hr_items"]["Row"];
type HRItemInsert = HRDatabase["public"]["Tables"]["hr_items"]["Insert"];
type HRItemUpdate = HRDatabase["public"]["Tables"]["hr_items"]["Update"];
type HRItemAssigneeRow = HRDatabase["public"]["Tables"]["hr_item_assignees"]["Row"];
type HRItemAssigneeInsert = HRDatabase["public"]["Tables"]["hr_item_assignees"]["Insert"];
type HRPaymentRow = HRDatabase["public"]["Tables"]["hr_payments"]["Row"];
type HRPaymentInsert = HRDatabase["public"]["Tables"]["hr_payments"]["Insert"];
type TypedSupabaseClient = SupabaseClient<HRDatabase>;
type HeroTransitionIds = {
  lineIdByLocalLineId: Record<string, string>;
  hrItemIdByLocalLineId: Record<string, string>;
};

export interface HRSource {
  mode: WorkspaceMode["kind"];
  getProjectHRItems: (projectId: string, financeLoadAccess?: FinanceRowLoadAccess) => Promise<HRPlannedItem[]>;
  getProjectHRPayments: (projectId: string) => Promise<HRPayment[]>;
}

export interface HeroHRItemUpsertInput {
  id: string;
  projectId: string;
  projectStageId?: string | null;
  estimateResourceLineId?: string | null;
  estimateWorkId?: string | null;
  taskId?: string | null;
  title: string;
  description?: string | null;
  compensationType?: HRItemRow["compensation_type"];
  plannedCostCents?: number | null;
  actualCostCents?: number | null;
  status?: HRItemRow["status"];
  startAt?: string | null;
  endAt?: string | null;
  createdBy: string;
}

export interface ResolveExistingHeroHRItemInput {
  localLineId: string;
  estimateResourceLineId?: string | null;
  estimateWorkId?: string | null;
  taskId?: string | null;
  title: string;
  knownHrItemId?: string | null;
}

export interface ExistingHeroHRLineageRow {
  id: string;
  estimateResourceLineId: string | null;
  estimateWorkId: string | null;
  taskId: string | null;
  title: string;
  description: string | null;
  compensationType: HRItemRow["compensation_type"];
  plannedCostCents: number | null;
  actualCostCents: number | null;
  status: HRItemRow["status"];
  startAt: string | null;
  endAt: string | null;
  createdBy: string;
}

export interface SetProjectHRAssigneesInput {
  projectId: string;
  hrItemId: string;
  assigneeIds: string[];
}

export interface SetProjectHRItemStatusInput {
  projectId: string;
  hrItemId: string;
  status: HRItemStatus;
}

export interface CreateProjectHRPaymentInput {
  projectId: string;
  hrItemId: string;
  amount: number;
  paidAt: string;
  note?: string | null;
}

export interface SyncProjectHRFromEstimateInput {
  projectId: string;
  estimateStatus: EstimateExecutionStatus;
  works: Array<Pick<EstimateV2Work, "id" | "taskId" | "plannedStart" | "plannedEnd">>;
  lines: Array<Pick<
    EstimateV2ResourceLine,
    "id" | "stageId" | "workId" | "title" | "type" | "qtyMilli" | "costUnitCents" | "assigneeId"
  >>;
}

function createBrowserHRSource(mode: "demo" | "local"): HRSource {
  return {
    mode,
    async getProjectHRItems(projectId: string) {
      return getHRItems(projectId);
    },
    async getProjectHRPayments(projectId: string) {
      return getHRPayments(projectId);
    },
  };
}

interface HROperationalRpcItem {
  hr_item_id: string;
  project_id: string;
  project_stage_id: string | null;
  estimate_resource_line_id: string | null;
  estimate_work_id: string | null;
  task_id: string | null;
  title: string;
  description: string | null;
  compensation_type: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  planned_cost_cents: number | null;
  actual_cost_cents: number | null;
  estimate_resource_line_resource_type: string | null;
  assignees: Array<{ profile_id: string; role_label: string | null }>;
  created_at: string;
  updated_at: string;
}

function parseHROperationalSummaryPayload(data: unknown): HROperationalRpcItem[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const items = root.hr_items;
  if (!Array.isArray(items)) return [];

  return items
    .map((raw): HROperationalRpcItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const id = row.hr_item_id;
      if (typeof id !== "string") return null;

      return {
        hr_item_id: id,
        project_id: typeof row.project_id === "string" ? row.project_id : "",
        project_stage_id: typeof row.project_stage_id === "string" ? row.project_stage_id : null,
        estimate_resource_line_id: typeof row.estimate_resource_line_id === "string" ? row.estimate_resource_line_id : null,
        estimate_work_id: typeof row.estimate_work_id === "string" ? row.estimate_work_id : null,
        task_id: typeof row.task_id === "string" ? row.task_id : null,
        title: typeof row.title === "string" ? row.title : "",
        description: typeof row.description === "string" ? row.description : null,
        compensation_type: typeof row.compensation_type === "string" ? row.compensation_type : "fixed",
        status: typeof row.status === "string" ? row.status : "planned",
        start_at: typeof row.start_at === "string" ? row.start_at : null,
        end_at: typeof row.end_at === "string" ? row.end_at : null,
        planned_cost_cents: typeof row.planned_cost_cents === "number" ? row.planned_cost_cents : null,
        actual_cost_cents: typeof row.actual_cost_cents === "number" ? row.actual_cost_cents : null,
        estimate_resource_line_resource_type: typeof row.estimate_resource_line_resource_type === "string"
          ? row.estimate_resource_line_resource_type
          : null,
        assignees: Array.isArray(row.assignees)
          ? (row.assignees as Array<Record<string, unknown>>)
            .filter((a) => typeof a?.profile_id === "string")
            .map((a) => ({
              profile_id: a.profile_id as string,
              role_label: typeof a.role_label === "string" ? a.role_label : null,
            }))
          : [],
        created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
      };
    })
    .filter((item): item is HROperationalRpcItem => item !== null);
}

function shapeHROperationalRpcItems(items: HROperationalRpcItem[]): HRPlannedItem[] {
  return items.map((row) => {
    const assigneeIds = row.assignees.map((a) => a.profile_id);
    const plannedCost = Math.max(0, row.planned_cost_cents ?? 0) / 100;

    let hrType: HRItemType = "labor";
    if (row.estimate_resource_line_resource_type) {
      const projection = projectToHrItemType(row.estimate_resource_line_resource_type as DbEstimateResourceType);
      if (projection.kind === "ok") {
        hrType = projection.type;
      }
    }

    return {
      id: row.hr_item_id,
      projectId: row.project_id,
      stageId: row.project_stage_id ?? "",
      workId: row.estimate_work_id ?? "",
      taskId: row.task_id ?? null,
      title: row.title,
      type: hrType,
      plannedQty: row.planned_cost_cents == null ? 0 : 1,
      plannedRate: plannedCost,
      assignee: assigneeIds[0] ?? null,
      assigneeIds,
      status: mapHRItemStatus(row.status as HRItemRow["status"]),
      lockedFromEstimate: Boolean(row.estimate_resource_line_id) || Boolean(row.estimate_work_id),
      sourceEstimateV2LineId: row.estimate_resource_line_id ?? null,
      orphaned: false,
      orphanedAt: null,
      orphanedReason: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

function mapHRItemStatus(
  status: HRItemRow["status"],
): HRPlannedItem["status"] {
  if (status === "completed") {
    return "done";
  }

  return status;
}

export function hrStatusRequiresAssignee(status: HRItemStatus): boolean {
  return status === "in_progress" || status === "done";
}

export function mapHRItemStatusToRemoteStatus(
  status: HRItemStatus,
): HRItemRow["status"] {
  if (status === "done") {
    return "completed";
  }

  if (
    status === "planned"
    || status === "in_progress"
    || status === "cancelled"
  ) {
    return status;
  }

  throw new Error("Blocked status is not yet supported in Supabase mode.");
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

function assertLocalMutation(result: { ok: boolean; error?: string }): void {
  if (!result.ok) {
    throw new Error(result.error ?? "Unable to update HR item.");
  }
}

async function assertProjectHRItemExists(
  supabase: TypedSupabaseClient,
  input: {
    projectId: string;
    hrItemId: string;
  },
): Promise<void> {
  const { data, error } = await supabase
    .from("hr_items")
    .select("id")
    .eq("id", input.hrItemId)
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("HR item not found");
  }
}

export function mapHRPaymentRowToHRPayment(row: HRPaymentRow): HRPayment {
  return {
    id: row.id,
    projectId: row.project_id,
    hrItemId: row.hr_item_id ?? "",
    amount: row.amount_cents / 100,
    paidAt: row.paid_at ?? row.created_at,
    note: row.notes ?? null,
    createdAt: row.created_at,
  };
}

function linePlannedCostCents(
  line: Pick<EstimateV2ResourceLine, "qtyMilli" | "costUnitCents">,
): number {
  return Math.max(0, Math.round(line.costUnitCents * (line.qtyMilli / 1_000)));
}

function buildEstimateLineIdByHRItemId(
  ids: HeroTransitionIds | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!ids) return map;

  Object.entries(ids.hrItemIdByLocalLineId).forEach(([localLineId, hrItemId]) => {
    const estimateLineId = ids.lineIdByLocalLineId[localLineId] ?? localLineId;
    map.set(hrItemId, estimateLineId);
  });

  return map;
}

function buildHRItemIdByEstimateLineId(
  ids: HeroTransitionIds | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!ids) return map;

  Object.entries(ids.hrItemIdByLocalLineId).forEach(([localLineId, hrItemId]) => {
    map.set(localLineId, hrItemId);
    const estimateLineId = ids.lineIdByLocalLineId[localLineId];
    if (estimateLineId) {
      map.set(estimateLineId, hrItemId);
    }
  });

  return map;
}

async function resolveHeroTransitionIds(
  supabase: TypedSupabaseClient,
  projectId: string,
): Promise<HeroTransitionIds | null> {
  const cache = loadEstimateV2HeroTransitionCache(projectId);
  if (cache?.ids) {
    return {
      lineIdByLocalLineId: { ...cache.ids.lineIdByLocalLineId },
      hrItemIdByLocalLineId: { ...cache.ids.hrItemIdByLocalLineId },
    };
  }

  const latestEvent = await getLatestHeroTransitionEvent(supabase, projectId);
  if (!latestEvent) {
    return null;
  }

  return {
    lineIdByLocalLineId: { ...latestEvent.payload.ids.lineIdByLocalLineId },
    hrItemIdByLocalLineId: { ...latestEvent.payload.ids.hrItemIdByLocalLineId },
  };
}

export async function resolveExistingHeroHRItemsByLineage(
  supabase: TypedSupabaseClient,
  input: {
    projectId: string;
    items: ResolveExistingHeroHRItemInput[];
  },
): Promise<Map<string, ExistingHeroHRLineageRow>> {
  if (input.items.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("hr_items")
    .select("id, estimate_resource_line_id, estimate_work_id, task_id, title, description, compensation_type, planned_cost_cents, actual_cost_cents, status, start_at, end_at, created_by")
    .eq("project_id", input.projectId);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const rowByEstimateLineId = new Map<string, HRItemRow>();
  rows.forEach((row) => {
    if (!row.estimate_resource_line_id) {
      return;
    }
    if (rowByEstimateLineId.has(row.estimate_resource_line_id)) {
      throw new Error(`Ambiguous remote HR mapping for estimate line "${row.estimate_resource_line_id}"`);
    }
    rowByEstimateLineId.set(row.estimate_resource_line_id, row);
  });
  const result = new Map<string, ExistingHeroHRLineageRow>();

  input.items.forEach((item) => {
    const requestedEstimateLineId = item.estimateResourceLineId ?? null;
    const estimateLineMatch = requestedEstimateLineId
      ? rowByEstimateLineId.get(requestedEstimateLineId) ?? null
      : null;
    const directMatch = item.knownHrItemId ? rowById.get(item.knownHrItemId) ?? null : null;
    const eligibleDirectMatch = directMatch && (
      directMatch.estimate_resource_line_id == null
      || directMatch.estimate_resource_line_id === requestedEstimateLineId
    )
      ? directMatch
      : null;
    const lineageMatches = rows.filter((row) => (
      row.estimate_resource_line_id == null
      && row.estimate_work_id === (item.estimateWorkId ?? null)
      && row.task_id === (item.taskId ?? null)
      && row.title === item.title
    ));

    if (!estimateLineMatch && !eligibleDirectMatch && lineageMatches.length > 1) {
      throw new Error(`Ambiguous remote HR mapping for "${item.title}"`);
    }

    const resolved = estimateLineMatch ?? eligibleDirectMatch ?? lineageMatches[0] ?? null;
    if (!resolved) {
      return;
    }

    result.set(item.localLineId, {
      id: resolved.id,
      estimateResourceLineId: resolved.estimate_resource_line_id ?? null,
      estimateWorkId: resolved.estimate_work_id ?? null,
      taskId: resolved.task_id ?? null,
      title: resolved.title,
      description: resolved.description ?? null,
      compensationType: resolved.compensation_type,
      plannedCostCents: resolved.planned_cost_cents ?? null,
      actualCostCents: resolved.actual_cost_cents ?? null,
      status: resolved.status,
      startAt: resolved.start_at ?? null,
      endAt: resolved.end_at ?? null,
      createdBy: resolved.created_by,
    });
  });

  return result;
}

async function syncHRItemAssignees(
  supabase: TypedSupabaseClient,
  input: {
    hrItemId: string;
    assigneeIds: string[];
  },
): Promise<void> {
  const normalizedAssigneeIds = normalizeAssigneeIds(input.assigneeIds);

  const { data, error } = await supabase
    .from("hr_item_assignees")
    .select("id, profile_id")
    .eq("hr_item_id", input.hrItemId);

  if (error) {
    throw error;
  }

  const existingRows = data ?? [];
  const existingByProfileId = new Map(
    existingRows.map((row) => [row.profile_id, row]),
  );
  const nextProfileIdSet = new Set(normalizedAssigneeIds);

  const rowsToInsert: HRItemAssigneeInsert[] = normalizedAssigneeIds
    .filter((profileId) => !existingByProfileId.has(profileId))
    .map((profileId) => ({
      hr_item_id: input.hrItemId,
      profile_id: profileId,
      role_label: null,
    }));

  const rowIdsToDelete = existingRows
    .filter((row) => !nextProfileIdSet.has(row.profile_id))
    .map((row) => row.id);

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("hr_item_assignees")
      .insert(rowsToInsert);

    if (insertError) {
      throw insertError;
    }
  }

  if (rowIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("hr_item_assignees")
      .delete()
      .in("id", rowIdsToDelete);

    if (deleteError) {
      throw deleteError;
    }
  }
}

export function shapeHRItemsWithAssignees(input: {
  itemRows: HRItemRow[];
  assigneeRows: HRItemAssigneeRow[];
  estimateLineIdByItemId?: Map<string, string>;
  estimateLineResourceTypeById?: Map<string, string>;
}): HRPlannedItem[] {
  const assigneeIdsByItemId = new Map<string, string[]>();

  for (const row of input.assigneeRows) {
    const assigneeIds = assigneeIdsByItemId.get(row.hr_item_id) ?? [];
    if (!assigneeIds.includes(row.profile_id)) {
      assigneeIds.push(row.profile_id);
    }
    assigneeIdsByItemId.set(row.hr_item_id, assigneeIds);
  }

  return input.itemRows.map((row) => {
    const assigneeIds = assigneeIdsByItemId.get(row.id) ?? [];
    const plannedCost = Math.max(0, row.planned_cost_cents ?? 0) / 100;
    const fallbackEstimateLineId = input.estimateLineIdByItemId?.get(row.id) ?? null;
    const linkedEstimateLineId = row.estimate_resource_line_id ?? fallbackEstimateLineId;

    let hrType: HRItemType = "labor";
    if (linkedEstimateLineId && input.estimateLineResourceTypeById) {
      const dbType = input.estimateLineResourceTypeById.get(linkedEstimateLineId);
      const projection = projectToHrItemType(dbType as DbEstimateResourceType | undefined);
      if (projection.kind === "ok") {
        hrType = projection.type;
      }
    }

    return {
      id: row.id,
      projectId: row.project_id,
      stageId: row.project_stage_id ?? "",
      workId: row.estimate_work_id ?? "",
      taskId: row.task_id ?? null,
      title: row.title,
      type: hrType,
      plannedQty: row.planned_cost_cents == null ? 0 : 1,
      plannedRate: plannedCost,
      assignee: assigneeIds[0] ?? null,
      assigneeIds,
      status: mapHRItemStatus(row.status),
      lockedFromEstimate: Boolean(linkedEstimateLineId) || Boolean(row.estimate_work_id),
      sourceEstimateV2LineId: linkedEstimateLineId,
      orphaned: false,
      orphanedAt: null,
      orphanedReason: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

export async function upsertHeroHRItems(
  supabase: TypedSupabaseClient,
  inputs: HeroHRItemUpsertInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const rows: HRItemInsert[] = inputs.map((input) => {
    const row: HRItemInsert = {
      id: input.id,
      project_id: input.projectId,
      title: input.title,
      created_by: input.createdBy,
    };

    row.project_stage_id = input.projectStageId ?? null;
    row.estimate_resource_line_id = input.estimateResourceLineId ?? null;
    row.estimate_work_id = input.estimateWorkId ?? null;
    row.task_id = input.taskId ?? null;
    row.description = input.description ?? null;
    row.compensation_type = input.compensationType ?? "fixed";
    row.planned_cost_cents = input.plannedCostCents ?? null;
    row.actual_cost_cents = input.actualCostCents ?? null;
    row.start_at = input.startAt ?? null;
    row.end_at = input.endAt ?? null;

    if (input.status) {
      row.status = input.status;
    }

    return row;
  });

  const { error } = await supabase
    .from("hr_items")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function deleteHeroHRItems(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("hr_items")
    .delete()
    .in("id", ids);

  if (error) {
    throw error;
  }
}

async function unlinkHeroHRItems(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("hr_items")
    .update({
      estimate_resource_line_id: null,
      estimate_work_id: null,
      task_id: null,
    })
    .in("id", ids);

  if (error) {
    throw error;
  }
}

async function loadHeroHRItemsByProject(
  supabase: TypedSupabaseClient,
  projectId: string,
): Promise<Array<Pick<HRItemRow, "id" | "estimate_resource_line_id">>> {
  const { data, error } = await supabase
    .from("hr_items")
    .select("id, estimate_resource_line_id")
    .eq("project_id", projectId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function setProjectHRAssignees(
  mode: WorkspaceMode,
  input: SetProjectHRAssigneesInput,
): Promise<void> {
  if (mode.kind !== "supabase") {
    assertLocalMutation(setHRAssignees(
      input.projectId,
      input.hrItemId,
      normalizeAssigneeIds(input.assigneeIds),
    ));
    return;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("hr_items")
    .select("id, estimate_resource_line_id, estimate_work_id")
    .eq("id", input.hrItemId)
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("HR item not found");
  }

  if (data.estimate_resource_line_id || data.estimate_work_id) {
    throw new Error(HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE);
  }

  await syncHRItemAssignees(supabase, {
    hrItemId: input.hrItemId,
    assigneeIds: input.assigneeIds,
  });
}

export async function setProjectHRItemStatus(
  mode: WorkspaceMode,
  input: SetProjectHRItemStatusInput,
): Promise<void> {
  if (mode.kind !== "supabase") {
    assertLocalMutation(setStatus(input.hrItemId, input.status));
    return;
  }

  const remoteStatus = mapHRItemStatusToRemoteStatus(input.status);
  const supabase = await loadSupabaseClient();
  await assertProjectHRItemExists(supabase, input);

  if (hrStatusRequiresAssignee(input.status)) {
    const { data, error } = await supabase
      .from("hr_item_assignees")
      .select("id")
      .eq("hr_item_id", input.hrItemId)
      .limit(1);

    if (error) {
      throw error;
    }

    if ((data ?? []).length === 0) {
      throw new Error("Assign at least one person before starting/completing work");
    }
  }

  const patch: HRItemUpdate = {
    status: remoteStatus,
  };
  const { data, error } = await supabase
    .from("hr_items")
    .update(patch)
    .eq("id", input.hrItemId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("HR item not found");
  }
}

export async function createProjectHRPayment(
  mode: WorkspaceMode,
  input: CreateProjectHRPaymentInput,
): Promise<HRPayment> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  if (mode.kind !== "supabase") {
    const payment = addPayment(
      input.hrItemId,
      input.amount,
      input.paidAt,
      input.note ?? undefined,
    );

    if (!payment) {
      throw new Error("HR item not found");
    }

    return payment;
  }

  const supabase = await loadSupabaseClient();
  await assertProjectHRItemExists(supabase, input);

  const insert: HRPaymentInsert = {
    project_id: input.projectId,
    hr_item_id: input.hrItemId,
    paid_to_profile_id: null,
    amount_cents: Math.round(input.amount * 100),
    status: "paid",
    paid_at: input.paidAt,
    notes: input.note?.trim() ? input.note.trim() : null,
    created_by: mode.profileId,
  };

  const { data, error } = await supabase
    .from("hr_payments")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create HR payment");
  }

  return mapHRPaymentRowToHRPayment(data);
}

export async function syncProjectHRFromEstimate(
  mode: WorkspaceMode,
  input: SyncProjectHRFromEstimateInput,
): Promise<void> {
  if (mode.kind !== "supabase" || input.estimateStatus === "planning") {
    return;
  }

  const supabase = await loadSupabaseClient();
  const heroIds = await resolveHeroTransitionIds(supabase, input.projectId);
  const hrItemIdByEstimateLineId = buildHRItemIdByEstimateLineId(heroIds);
  const workById = new Map(input.works.map((work) => [work.id, work]));
  const syncableLines = input.lines
    .filter((line) => line.type === "labor" || line.type === "subcontractor")
    .map((line) => ({
      line,
      work: workById.get(line.workId) ?? null,
    }))
    .filter((entry) => Boolean(entry.work?.taskId));
  const syncableLineIdSet = new Set(syncableLines.map(({ line }) => line.id));
  const existingProjectRows = await loadHeroHRItemsByProject(supabase, input.projectId);
  const existingProjectRowsById = new Map(existingProjectRows.map((row) => [row.id, row]));

  const staleBackendLinkedHrItemIds = existingProjectRows
    .filter((row) => row.estimate_resource_line_id && !syncableLineIdSet.has(row.estimate_resource_line_id))
    .map((row) => row.id);

  const staleLegacyHrItemIds = Array.from(
    new Set(
      Object.entries(heroIds?.hrItemIdByLocalLineId ?? {})
        .filter(([localLineId]) => {
          const estimateLineId = heroIds?.lineIdByLocalLineId[localLineId] ?? localLineId;
          return !syncableLineIdSet.has(estimateLineId);
        })
        .map(([, hrItemId]) => {
          const row = existingProjectRowsById.get(hrItemId);
          return row?.estimate_resource_line_id == null ? hrItemId : null;
        })
        .filter(Boolean),
    ),
  );

  await unlinkHeroHRItems(
    supabase,
    Array.from(new Set([...staleBackendLinkedHrItemIds, ...staleLegacyHrItemIds])),
  );

  if (syncableLines.length === 0) {
    return;
  }

  const existingHrRowsByLocalLineId = await resolveExistingHeroHRItemsByLineage(supabase, {
    projectId: input.projectId,
    items: syncableLines.map(({ line, work }) => ({
      localLineId: line.id,
      estimateResourceLineId: line.id,
      estimateWorkId: line.workId,
      taskId: work?.taskId ?? null,
      title: line.title,
      knownHrItemId: hrItemIdByEstimateLineId.get(line.id) ?? null,
    })),
  });

  const rowsToUpsert = syncableLines
    .map(({ line, work }) => {
      const existingRow = existingHrRowsByLocalLineId.get(line.id) ?? null;
      const hrItemId = existingRow?.id
        ?? hrItemIdByEstimateLineId.get(line.id)
        ?? line.id;

      return {
        id: hrItemId,
        projectId: input.projectId,
        projectStageId: line.stageId,
        estimateResourceLineId: line.id,
        estimateWorkId: line.workId,
        taskId: work?.taskId ?? null,
        title: line.title,
        description: existingRow?.description ?? null,
        compensationType: existingRow?.compensationType ?? "fixed",
        plannedCostCents: linePlannedCostCents(line),
        actualCostCents: existingRow?.actualCostCents ?? null,
        status: existingRow?.status ?? "planned",
        startAt: work?.plannedStart ?? existingRow?.startAt ?? null,
        endAt: work?.plannedEnd ?? existingRow?.endAt ?? null,
        createdBy: existingRow?.createdBy ?? mode.profileId,
      } satisfies HeroHRItemUpsertInput;
    })
    .filter((row): row is HeroHRItemUpsertInput => Boolean(row));

  if (rowsToUpsert.length === 0) {
    return;
  }

  await upsertHeroHRItems(
    supabase,
    rowsToUpsert,
  );

  const hrItemIdByLineId = new Map(
    syncableLines.map(({ line }, index) => [line.id, rowsToUpsert[index]?.id ?? line.id]),
  );

  /** Reconcile `hr_item_assignees` to match estimate lines (including clearing when line is free-text only). */
  const assigneeTargets = syncableLines.map(({ line }) => {
    const existingRow = existingHrRowsByLocalLineId.get(line.id) ?? null;
    const hrItemId = existingRow?.id
      ?? hrItemIdByEstimateLineId.get(line.id)
      ?? hrItemIdByLineId.get(line.id)
      ?? line.id;
    const trimmed = line.assigneeId?.trim();
    return {
      hrItemId,
      assigneeIds: trimmed ? [trimmed] : [],
    };
  });

  await Promise.all(
    assigneeTargets.map(({ hrItemId, assigneeIds }) => syncHRItemAssignees(supabase, {
      hrItemId,
      assigneeIds,
    })),
  );
}

function createSupabaseHRSource(
  supabase: TypedSupabaseClient,
): HRSource {
  return {
    mode: "supabase",
    async getProjectHRItems(projectId: string, financeLoadAccess: FinanceRowLoadAccess = "full") {
      if (financeLoadAccess !== "full") {
        const { data, error } = await supabase.rpc("get_hr_operational_summary", {
          p_project_id: projectId,
          p_limit: 500,
          p_offset: 0,
        });

        if (error) {
          throw error;
        }

        return shapeHROperationalRpcItems(parseHROperationalSummaryPayload(data));
      }

      const { data: itemRows, error: itemsError } = await supabase
        .from("hr_items")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (itemsError) {
        throw itemsError;
      }

      const rows = itemRows ?? [];
      if (rows.length === 0) {
        return [];
      }

      const itemIds = rows.map((row) => row.id);
      const { data: assigneeRows, error: assigneesError } = await supabase
        .from("hr_item_assignees")
        .select("*")
        .in("hr_item_id", itemIds)
        .order("created_at", { ascending: true });

      if (assigneesError) {
        throw assigneesError;
      }

      const heroIds = await resolveHeroTransitionIds(supabase, projectId);

      const estimateLineIds = rows
        .map((row) => row.estimate_resource_line_id)
        .filter((id): id is string => id != null);

      const estimateLineResourceTypeById = new Map<string, string>();
      if (estimateLineIds.length > 0) {
        const { data: lineRows } = await supabase
          .from("estimate_resource_lines")
          .select("id, resource_type")
          .in("id", estimateLineIds);
        for (const lr of lineRows ?? []) {
          estimateLineResourceTypeById.set(lr.id, lr.resource_type);
        }
      }

      return shapeHRItemsWithAssignees({
        itemRows: rows,
        assigneeRows: assigneeRows ?? [],
        estimateLineIdByItemId: buildEstimateLineIdByHRItemId(heroIds),
        estimateLineResourceTypeById,
      });
    },

    async getProjectHRPayments(projectId: string) {
      const { data, error } = await supabase
        .from("hr_payments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapHRPaymentRowToHRPayment);
    },
  };
}

export async function getHRSource(
  mode?: WorkspaceMode,
): Promise<HRSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserHRSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseHRSource(supabase);
}
