import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import {
  resolveRuntimeWorkspaceMode,
  type RuntimeWorkspaceMode,
  type WorkspaceMode,
} from "@/data/workspace-source";
import type { Stage, Task } from "@/types/entities";
import type { Database as PlanningDatabase } from "../../backend-truth/generated/supabase-types";

type ProjectStageRow = PlanningDatabase["public"]["Tables"]["project_stages"]["Row"];
type TaskRow = PlanningDatabase["public"]["Tables"]["tasks"]["Row"];
type ProjectStageInsert = PlanningDatabase["public"]["Tables"]["project_stages"]["Insert"];
type TaskInsert = PlanningDatabase["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdateRow = PlanningDatabase["public"]["Tables"]["tasks"]["Update"];
type TypedSupabaseClient = SupabaseClient<PlanningDatabase>;

const PROJECT_STAGE_SELECT = "id, project_id, title, description, sort_order, status";
const TASK_SELECT = "id, project_id, stage_id, title, description, status, assignee_profile_id, created_at, start_at, due_at";

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

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
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

      return (data ?? []).map(mapTaskRowToTask);
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
