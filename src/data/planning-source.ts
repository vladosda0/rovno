import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import {
  resolveWorkspaceMode,
  type WorkspaceMode,
} from "@/data/workspace-source";
import type { Stage, Task } from "@/types/entities";
import type { Database as PlanningDatabase } from "../../backend-truth/generated/supabase-types";

type ProjectStageRow = PlanningDatabase["public"]["Tables"]["project_stages"]["Row"];
type TaskRow = PlanningDatabase["public"]["Tables"]["tasks"]["Row"];
type TypedSupabaseClient = SupabaseClient<PlanningDatabase>;

export interface PlanningSource {
  mode: WorkspaceMode["kind"];
  getProjectStages: (projectId: string) => Promise<Stage[]>;
  getProjectTasks: (projectId: string) => Promise<Task[]>;
}

const demoPlanningSource: PlanningSource = {
  mode: "demo",
  async getProjectStages(projectId: string) {
    return store.getStages(projectId);
  },
  async getProjectTasks(projectId: string) {
    return store.getTasks(projectId);
  },
};

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
        .select("id, project_id, title, description, sort_order, status")
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
        .select("id, project_id, stage_id, title, description, status, assignee_profile_id, created_at, start_at, due_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapTaskRowToTask);
    },
  };
}

export async function getPlanningSource(
  mode?: WorkspaceMode,
): Promise<PlanningSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return demoPlanningSource;
  }

  const supabase = await loadSupabaseClient();
  return createSupabasePlanningSource(supabase);
}
