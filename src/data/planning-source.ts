import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import {
  resolveRuntimeWorkspaceMode,
  type RuntimeWorkspaceMode,
  type WorkspaceMode,
} from "@/data/workspace-source";
import type { ChecklistItem, ChecklistItemType, Stage, Task } from "@/types/entities";
import type { Database as PlanningDatabase } from "../../backend-truth/generated/supabase-types";

type ProjectStageRow = PlanningDatabase["public"]["Tables"]["project_stages"]["Row"];
type TaskRow = PlanningDatabase["public"]["Tables"]["tasks"]["Row"];
type TaskChecklistItemRow = PlanningDatabase["public"]["Tables"]["task_checklist_items"]["Row"];
type EstimateResourceLineRow = PlanningDatabase["public"]["Tables"]["estimate_resource_lines"]["Row"];
type ProjectStageInsert = PlanningDatabase["public"]["Tables"]["project_stages"]["Insert"];
type TaskInsert = PlanningDatabase["public"]["Tables"]["tasks"]["Insert"];
type TaskChecklistItemInsert = PlanningDatabase["public"]["Tables"]["task_checklist_items"]["Insert"];
type TaskUpdateRow = PlanningDatabase["public"]["Tables"]["tasks"]["Update"];
type TypedSupabaseClient = SupabaseClient<PlanningDatabase>;

const PROJECT_STAGE_SELECT = "id, project_id, title, description, sort_order, status";
const TASK_SELECT = "id, project_id, stage_id, title, description, status, assignee_profile_id, created_at, start_at, due_at";
const TASK_CHECKLIST_SELECT = "id, task_id, title, is_done, procurement_item_id, estimate_resource_line_id, estimate_work_id, sort_order";
const ESTIMATE_RESOURCE_LINE_SELECT = "id, resource_type, quantity, unit";

export interface CreateProjectStageInput {
  projectId: string;
  title: string;
  description?: string;
  order: number;
  status?: Stage["status"];
}

export interface CreateProjectTaskInput {
  projectId: string;
  stageId: string;
  title: string;
  description?: string;
  status?: Task["status"];
  assigneeId?: string;
  createdBy: string;
  deadline?: string;
}

export interface UpdateProjectTaskInput {
  stageId?: string;
  title?: string;
  description?: string;
  status?: Task["status"];
  assigneeId?: string | null;
  deadline?: string | null;
  startDate?: string | null;
}

export interface PlanningSource {
  mode: WorkspaceMode["kind"];
  getProjectStages: (projectId: string) => Promise<Stage[]>;
  getProjectTasks: (projectId: string) => Promise<Task[]>;
  createProjectStage: (input: CreateProjectStageInput) => Promise<Stage>;
  createProjectTask: (input: CreateProjectTaskInput) => Promise<Task>;
  updateProjectTask: (taskId: string, patch: UpdateProjectTaskInput) => Promise<Task>;
}

export interface EnsureProjectStageInput {
  localStageId: string;
  remoteStageId: string;
  projectId: string;
  title: string;
  description?: string;
  order: number;
  status?: Stage["status"];
  discountBps?: number;
}

export interface HeroTaskUpsertInput {
  id: string;
  projectId: string;
  stageId: string;
  title: string;
  description?: string;
  status?: Task["status"];
  assigneeId?: string | null;
  createdBy: string;
  startAt?: string | null;
  dueAt?: string | null;
}

export interface HeroTaskChecklistItemUpsertInput {
  id: string;
  taskId: string;
  title: string;
  isDone?: boolean;
  procurementItemId?: string | null;
  estimateResourceLineId?: string | null;
  estimateWorkId?: string | null;
  sortOrder: number;
}

function mapTaskPatchToTaskUpdateRow(patch: UpdateProjectTaskInput): TaskUpdateRow {
  const update: TaskUpdateRow = {};

  if (patch.stageId !== undefined) {
    update.stage_id = patch.stageId;
  }
  if (patch.title !== undefined) {
    update.title = patch.title;
  }
  if (patch.description !== undefined) {
    update.description = patch.description;
  }
  if (patch.status !== undefined) {
    update.status = patch.status;
  }
  if (patch.assigneeId !== undefined) {
    update.assignee_profile_id = patch.assigneeId || null;
  }
  if (patch.deadline !== undefined) {
    update.due_at = patch.deadline;
  }
  if (patch.startDate !== undefined) {
    update.start_at = patch.startDate;
  }

  return update;
}

function createBrowserPlanningSource(mode: "demo" | "local"): PlanningSource {
  return {
    mode,
    async getProjectStages(projectId: string) {
      return store.getStages(projectId);
    },
    async getProjectTasks(projectId: string) {
      return store.getTasks(projectId);
    },

    async createProjectStage(input: CreateProjectStageInput) {
      const stage: Stage = {
        id: `stage-${Date.now()}`,
        project_id: input.projectId,
        title: input.title,
        description: input.description ?? "",
        order: input.order,
        status: input.status ?? "open",
      };

      store.addStage(stage);
      return stage;
    },

    async createProjectTask(input: CreateProjectTaskInput) {
      const task: Task = {
        id: `task-${Date.now()}`,
        project_id: input.projectId,
        stage_id: input.stageId,
        title: input.title,
        description: input.description ?? "",
        status: input.status ?? "not_started",
        assignee_id: input.assigneeId ?? "",
        checklist: [],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: new Date().toISOString(),
        deadline: input.deadline ?? undefined,
      };

      store.addTask(task);
      return task;
    },

    async updateProjectTask(taskId: string, patch: UpdateProjectTaskInput) {
      const update: Partial<Task> = {};

      if (patch.stageId !== undefined) {
        update.stage_id = patch.stageId;
      }
      if (patch.title !== undefined) {
        update.title = patch.title;
      }
      if (patch.description !== undefined) {
        update.description = patch.description;
      }
      if (patch.status !== undefined) {
        update.status = patch.status;
      }
      if (patch.assigneeId !== undefined) {
        update.assignee_id = patch.assigneeId ?? "";
      }
      if (patch.deadline !== undefined) {
        update.deadline = patch.deadline ?? undefined;
      }
      if (patch.startDate !== undefined) {
        update.startDate = patch.startDate ?? undefined;
      }

      store.updateTask(taskId, update);
      const task = store.getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      return task;
    },
  };
}

export function mapProjectStageRowToStage(row: ProjectStageRow): Stage {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description ?? "",
    order: row.sort_order,
    status: row.status,
  };
}

export function mapTaskRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    project_id: row.project_id,
    stage_id: row.stage_id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    assignee_id: row.assignee_profile_id ?? "",
    checklist: [],
    comments: [],
    attachments: [],
    photos: [],
    linked_estimate_item_ids: [],
    created_at: row.created_at,
    startDate: row.start_at ?? undefined,
    deadline: row.due_at ?? undefined,
  };
}

function mapEstimateResourceTypeToChecklistType(
  resourceType: EstimateResourceLineRow["resource_type"] | null | undefined,
): ChecklistItemType {
  if (resourceType === "material") return "material";
  if (resourceType === "equipment") return "tool";
  return "subtask";
}

function mapTaskChecklistItemRowToChecklistItem(
  row: TaskChecklistItemRow,
  lineById: Map<string, Pick<EstimateResourceLineRow, "id" | "resource_type" | "quantity" | "unit">>,
): ChecklistItem {
  const linkedLine = row.estimate_resource_line_id
    ? lineById.get(row.estimate_resource_line_id)
    : undefined;
  const resourceType = linkedLine?.resource_type;

  return {
    id: row.id,
    text: row.title,
    done: row.is_done,
    type: mapEstimateResourceTypeToChecklistType(resourceType),
    procurementItemId: row.procurement_item_id ?? null,
    estimateV2LineId: row.estimate_resource_line_id ?? undefined,
    estimateV2WorkId: row.estimate_work_id ?? undefined,
    estimateV2ResourceType: resourceType === "equipment"
      ? "tool"
      : resourceType === "material"
        ? "material"
        : resourceType === "labor"
          ? "labor"
          : resourceType === "other"
            ? "other"
            : undefined,
    estimateV2QtyMilli: linkedLine?.quantity != null
      ? Math.max(1, Math.round(linkedLine.quantity * 1_000))
      : undefined,
    estimateV2Unit: linkedLine?.unit ?? undefined,
  };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

export async function ensureProjectStages(
  supabase: TypedSupabaseClient,
  inputs: EnsureProjectStageInput[],
): Promise<Record<string, string>> {
  if (inputs.length === 0) {
    return {};
  }

  const projectId = inputs[0].projectId;
  const { data, error } = await supabase
    .from("project_stages")
    .select("id, project_id, title, description, sort_order, status, discount_bps")
    .eq("project_id", projectId);

  if (error) {
    throw error;
  }

  const remoteRows = data ?? [];
  const mapping: Record<string, string> = {};
  const rowsToUpsert: ProjectStageInsert[] = [];

  inputs.forEach((input) => {
    const deterministicMatch = remoteRows.find((row) => row.id === input.remoteStageId) ?? null;
    const exactMatches = remoteRows.filter((row) => (
      row.title === input.title && row.sort_order === input.order
    ));

    if (exactMatches.length > 1) {
      throw new Error(`Ambiguous remote stage mapping for "${input.title}"`);
    }

    const resolvedId = deterministicMatch?.id ?? exactMatches[0]?.id ?? input.remoteStageId;
    mapping[input.localStageId] = resolvedId;

    rowsToUpsert.push({
      id: resolvedId,
      project_id: input.projectId,
      title: input.title,
      description: input.description ?? "",
      sort_order: input.order,
      status: input.status ?? "open",
      discount_bps: input.discountBps ?? 0,
    });
  });

  const { error: upsertError } = await supabase
    .from("project_stages")
    .upsert(rowsToUpsert, { onConflict: "id" });

  if (upsertError) {
    throw upsertError;
  }

  return mapping;
}

export async function upsertHeroTasks(
  supabase: TypedSupabaseClient,
  inputs: HeroTaskUpsertInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const rows: TaskInsert[] = inputs.map((input) => ({
    id: input.id,
    project_id: input.projectId,
    stage_id: input.stageId,
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "not_started",
    assignee_profile_id: input.assigneeId ?? null,
    created_by: input.createdBy,
    start_at: input.startAt ?? null,
    due_at: input.dueAt ?? null,
  }));

  const { error } = await supabase
    .from("tasks")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function upsertTaskChecklistItems(
  supabase: TypedSupabaseClient,
  inputs: HeroTaskChecklistItemUpsertInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const rows: TaskChecklistItemInsert[] = inputs.map((input) => ({
    id: input.id,
    task_id: input.taskId,
    title: input.title,
    is_done: input.isDone ?? false,
    procurement_item_id: input.procurementItemId ?? null,
    estimate_resource_line_id: input.estimateResourceLineId ?? null,
    estimate_work_id: input.estimateWorkId ?? null,
    sort_order: input.sortOrder,
  }));

  const { error } = await supabase
    .from("task_checklist_items")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function deleteHeroTaskChecklistItems(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("task_checklist_items")
    .delete()
    .in("id", ids);

  if (error) {
    throw error;
  }
}

export async function deleteHeroTasks(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("tasks")
    .delete()
    .in("id", ids);

  if (error) {
    throw error;
  }
}

function createSupabasePlanningSource(
  supabase: TypedSupabaseClient,
): PlanningSource {
  return {
    mode: "supabase",
    async getProjectStages(projectId: string) {
      const { data, error } = await supabase
        .from("project_stages")
        .select(PROJECT_STAGE_SELECT)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapProjectStageRowToStage);
    },

    async getProjectTasks(projectId: string) {
      const { data, error } = await supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      const taskRows = data ?? [];
      if (taskRows.length === 0) {
        return [];
      }

      const taskIds = taskRows.map((row) => row.id);
      const { data: checklistRows, error: checklistError } = await supabase
        .from("task_checklist_items")
        .select(TASK_CHECKLIST_SELECT)
        .in("task_id", taskIds)
        .order("sort_order", { ascending: true });

      if (checklistError) {
        throw checklistError;
      }

      const estimateLineIds = Array.from(new Set(
        (checklistRows ?? [])
          .map((row) => row.estimate_resource_line_id)
          .filter((value): value is string => Boolean(value)),
      ));

      let estimateLineRows: Array<Pick<EstimateResourceLineRow, "id" | "resource_type" | "quantity" | "unit">> = [];
      if (estimateLineIds.length > 0) {
        const { data: lineRows, error: lineError } = await supabase
          .from("estimate_resource_lines")
          .select(ESTIMATE_RESOURCE_LINE_SELECT)
          .in("id", estimateLineIds);

        if (lineError) {
          throw lineError;
        }

        estimateLineRows = lineRows ?? [];
      }

      const lineById = new Map(estimateLineRows.map((row) => [row.id, row]));
      const checklistByTaskId = new Map<string, ChecklistItem[]>();

      (checklistRows ?? []).forEach((row) => {
        const list = checklistByTaskId.get(row.task_id) ?? [];
        list.push(mapTaskChecklistItemRowToChecklistItem(row, lineById));
        checklistByTaskId.set(row.task_id, list);
      });

      return taskRows.map((row) => ({
        ...mapTaskRowToTask(row),
        checklist: checklistByTaskId.get(row.id) ?? [],
      }));
    },

    async createProjectStage(input: CreateProjectStageInput) {
      const insert: ProjectStageInsert = {
        project_id: input.projectId,
        title: input.title,
        description: input.description ?? "",
        sort_order: input.order,
        status: input.status ?? "open",
      };

      const { data, error } = await supabase
        .from("project_stages")
        .insert(insert)
        .select(PROJECT_STAGE_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return mapProjectStageRowToStage(data);
    },

    async createProjectTask(input: CreateProjectTaskInput) {
      const insert: TaskInsert = {
        project_id: input.projectId,
        stage_id: input.stageId,
        title: input.title,
        description: input.description ?? "",
        status: input.status ?? "not_started",
        assignee_profile_id: input.assigneeId || null,
        created_by: input.createdBy,
        due_at: input.deadline ?? null,
      };

      const { data, error } = await supabase
        .from("tasks")
        .insert(insert)
        .select(TASK_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return mapTaskRowToTask(data);
    },

    async updateProjectTask(taskId: string, patch: UpdateProjectTaskInput) {
      const { data, error } = await supabase
        .from("tasks")
        .update(mapTaskPatchToTaskUpdateRow(patch))
        .eq("id", taskId)
        .select(TASK_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return mapTaskRowToTask(data);
    },
  };
}

export async function getPlanningSource(
  mode?: RuntimeWorkspaceMode,
): Promise<PlanningSource> {
  const resolvedMode = mode ?? await resolveRuntimeWorkspaceMode();
  if (resolvedMode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  if (resolvedMode.kind !== "supabase") {
    return createBrowserPlanningSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabasePlanningSource(supabase);
}
