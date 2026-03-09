import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as store from "@/data/store";
import { getPlanningSource } from "@/data/planning-source";
import {
  hasSupabaseWorkspaceConfig,
  isSupabaseWorkspaceRequested,
  resolveWorkspaceMode,
  type WorkspaceMode,
} from "@/data/workspace-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import type { Stage, Task } from "@/types/entities";
import { getAuthStateSnapshot, isDemoSessionActive, subscribeAuthState } from "@/lib/auth-state";

const PLANNING_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_PLANNING_STAGES: Stage[] = [];
const EMPTY_PLANNING_TASKS: Task[] = [];

type PendingWorkspaceMode = { kind: "pending-supabase" };
type WorkspaceModeState = WorkspaceMode | PendingWorkspaceMode;

export const planningQueryKeys = {
  projectStages: (profileId: string, projectId: string) =>
    ["planning", "project-stages", profileId, projectId] as const,
  projectTasks: (profileId: string, projectId: string) =>
    ["planning", "project-tasks", profileId, projectId] as const,
};

function useWorkspaceModeState(): WorkspaceModeState {
  useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot);
  const demoSessionActive = isDemoSessionActive();
  const supabaseRequested = !demoSessionActive && isSupabaseWorkspaceRequested() && hasSupabaseWorkspaceConfig();
  const modeQuery = useQuery({
    queryKey: workspaceQueryKeys.mode(),
    queryFn: resolveWorkspaceMode,
    enabled: supabaseRequested,
    staleTime: PLANNING_QUERY_STALE_TIME_MS,
  });

  if (demoSessionActive) {
    return { kind: "demo" };
  }

  if (!supabaseRequested) {
    return { kind: "local" };
  }

  return modeQuery.data ?? { kind: "pending-supabase" };
}

function useStoreValue<T>(getter: () => T, enabled: boolean, fallback: T): T {
  const [value, setValue] = useState<T>(() => enabled ? getter() : fallback);

  useEffect(() => {
    if (!enabled) {
      setValue(fallback);
      return;
    }

    setValue(getter());
    const update = () => setValue(getter());
    return store.subscribe(update);
  }, [enabled, fallback, getter]);

  return enabled ? value : fallback;
}

export function usePlanningProjectStages(projectId: string): Stage[] {
  const mode = useWorkspaceModeState();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getStages = useCallback(() => store.getStages(projectId), [projectId]);
  const demoStages = useStoreValue(
    getStages,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_PLANNING_STAGES,
  );
  const stagesQuery = useQuery({
    queryKey: supabaseMode
      ? planningQueryKeys.projectStages(supabaseMode.profileId, projectId)
      : planningQueryKeys.projectStages("demo", projectId),
    queryFn: async () => {
      const source = await getPlanningSource(supabaseMode ?? undefined);
      return source.getProjectStages(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: PLANNING_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return demoStages;
  }

  return stagesQuery.data ?? EMPTY_PLANNING_STAGES;
}

export function usePlanningProjectTasks(projectId: string): Task[] {
  const mode = useWorkspaceModeState();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getTasks = useCallback(() => store.getTasks(projectId), [projectId]);
  const demoTasks = useStoreValue(
    getTasks,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_PLANNING_TASKS,
  );
  const tasksQuery = useQuery({
    queryKey: supabaseMode
      ? planningQueryKeys.projectTasks(supabaseMode.profileId, projectId)
      : planningQueryKeys.projectTasks("demo", projectId),
    queryFn: async () => {
      const source = await getPlanningSource(supabaseMode ?? undefined);
      return source.getProjectTasks(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: PLANNING_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return demoTasks;
  }

  return tasksQuery.data ?? EMPTY_PLANNING_TASKS;
}
