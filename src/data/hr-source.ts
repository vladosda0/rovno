import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getHRItems,
  getHRPayments,
} from "@/data/hr-store";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { HRPayment, HRPlannedItem } from "@/types/hr";
import type { Database as HRDatabase } from "../../backend-truth/generated/supabase-types";

type HRItemRow = HRDatabase["public"]["Tables"]["hr_items"]["Row"];
type HRItemInsert = HRDatabase["public"]["Tables"]["hr_items"]["Insert"];
type HRItemAssigneeRow = HRDatabase["public"]["Tables"]["hr_item_assignees"]["Row"];
type HRPaymentRow = HRDatabase["public"]["Tables"]["hr_payments"]["Row"];
type TypedSupabaseClient = SupabaseClient<HRDatabase>;

export interface HRSource {
  mode: WorkspaceMode["kind"];
  getProjectHRItems: (projectId: string) => Promise<HRPlannedItem[]>;
  getProjectHRPayments: (projectId: string) => Promise<HRPayment[]>;
}

export interface HeroHRItemUpsertInput {
  id: string;
  projectId: string;
  projectStageId?: string | null;
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

function mapHRItemStatus(
  status: HRItemRow["status"],
): HRPlannedItem["status"] {
  if (status === "completed") {
    return "done";
  }

  return status;
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

export function shapeHRItemsWithAssignees(input: {
  itemRows: HRItemRow[];
  assigneeRows: HRItemAssigneeRow[];
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

    return {
      id: row.id,
      projectId: row.project_id,
      stageId: row.project_stage_id ?? "",
      workId: row.estimate_work_id ?? "",
      title: row.title,
      // Temporary compatibility bucket until backend HR rows expose a reliable labor/subcontractor discriminator.
      type: "labor",
      plannedQty: 0,
      plannedRate: 0,
      assignee: assigneeIds[0] ?? null,
      assigneeIds,
      status: mapHRItemStatus(row.status),
      lockedFromEstimate: false,
      sourceEstimateV2LineId: null,
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

  const rows: HRItemInsert[] = inputs.map((input) => ({
    id: input.id,
    project_id: input.projectId,
    project_stage_id: input.projectStageId ?? null,
    estimate_work_id: input.estimateWorkId ?? null,
    task_id: input.taskId ?? null,
    title: input.title,
    description: input.description ?? null,
    compensation_type: input.compensationType ?? "fixed",
    planned_cost_cents: input.plannedCostCents ?? null,
    actual_cost_cents: input.actualCostCents ?? null,
    status: input.status ?? "planned",
    start_at: input.startAt ?? null,
    end_at: input.endAt ?? null,
    created_by: input.createdBy,
  }));

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

function createSupabaseHRSource(
  supabase: TypedSupabaseClient,
): HRSource {
  return {
    mode: "supabase",
    async getProjectHRItems(projectId: string) {
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

      return shapeHRItemsWithAssignees({
        itemRows: rows,
        assigneeRows: assigneeRows ?? [],
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
