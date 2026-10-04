import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectionAdvance } from "@/hooks/use-projection-advance";
import * as store from "@/data/store";
import {
  deriveEstimateTaskAssignees,
  getPlanningSource,
  getPrimaryEstimateTaskAssigneeId,
  pickEstimateLinesForTaskAssigneeProjection,
} from "@/data/planning-source";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { Stage, Task } from "@/types/entities";
import { countTaskStatuses, type ProjectStatusSummary } from "@/lib/project-status";
import {
  getEstimateV2ProjectState,
  subscribeEstimateV2,
} from "@/data/estimate-v2-store";

// 30s (P2): with focus refetch opted in below, returning to the tab after
// half a minute away re-checks the server truth without churning quick tab
// switches.
const PLANNING_QUERY_STALE_TIME_MS = 30_000;
const EMPTY_PLANNING_STAGES: Stage[] = [];
const EMPTY_PLANNING_TASKS: Task[] = [];
const EMPTY_STATUS_SUMMARY_BY_PROJECT: Record<string, ProjectStatusSummary> = {};

// Query keys are STABLE across estimate projection advances (no revision segment).
// A key that embeds projectedRevision collapses the cache to `undefined` on every
// sync — the UI flashes an empty list while the new key refetches. Instead the
// effect below invalidates the root when projectedRevision advances, which is a
// background refetch that keeps previous data mounted (same freshness, no flash).
export const planningQueryKeys = {
  projectStages: (profileId: string, projectId: string) =>
    ["planning", "project-stages", profileId, projectId] as const,
  projectTasks: (profileId: string, projectId: string) =>
    ["planning", "project-tasks", profileId, projectId] as const,
  projectsStatusSummary: (profileId: string, projectIds: string[]) =>
    ["planning", "projects-status-summary", profileId, projectIds] as const,
};

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

/**
 * Invalidate the planning roots when the tasks projection ADVANCES (stable-key
 * pattern). The first observed value is a baseline, not a change — invalidating
 * on mount would defeat staleTime and abort/duplicate the initial fetch.
 */
function usePlanningProjectionInvalidation(
  projectId: string,
  profileId: string | null,
  projectedRevision: string | null,
) {
  const queryClient = useQueryClient();
  useProjectionAdvance(
    profileId && projectId ? `${profileId}:${projectId}` : null,
    projectedRevision,
    () => {
      if (!profileId) return;
      void queryClient.invalidateQueries({
        queryKey: planningQueryKeys.projectStages(profileId, projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: planningQueryKeys.projectTasks(profileId, projectId),
      });
    },
  );
}

export function usePlanningProjectStagesState(projectId: string): { stages: Stage[]; isLoading: boolean } {
  const mode = useWorkspaceMode();
  const estimateState = useEstimateV2Project(projectId);
  const estimateSync = estimateState.sync;
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
    // Refetch on page entry: an estimate edit on another page can advance the
    // projection while this hook is unmounted; returning within staleTime would
    // otherwise serve the stale cached list. Stable key => background refetch
    // keeps prior rows visible (no empty flash).
    refetchOnMount: "always",
    // P2: local opt-in (global default stays false — App-level form-reset
    // rationale). Another session's write while this tab was backgrounded
    // must surface on return; staleTime bounds the churn.
    refetchOnWindowFocus: true,
  });

  usePlanningProjectionInvalidation(
    projectId,
    supabaseMode?.profileId ?? null,
    estimateSync.domains.tasks.projectedRevision ?? null,
  );

  if (mode.kind === "demo" || mode.kind === "local") {
    return { stages: demoStages, isLoading: false };
  }

  if (!supabaseMode) {
    return { stages: EMPTY_PLANNING_STAGES, isLoading: mode.kind === "pending-supabase" };
  }

  return { stages: stagesQuery.data ?? EMPTY_PLANNING_STAGES, isLoading: stagesQuery.isPending };
}

export function usePlanningProjectStages(projectId: string): Stage[] {
  return usePlanningProjectStagesState(projectId).stages;
}

export function usePlanningProjectTasksState(projectId: string): { tasks: Task[]; isLoading: boolean } {
  const mode = useWorkspaceMode();
  const estimateState = useEstimateV2Project(projectId);
  const estimateSync = estimateState.sync;
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  // useWorkspaceModeState builds a fresh object literal every render, so the
  // memo below depends on the profile id rather than on `supabaseMode` itself.
  const supabaseProfileId = supabaseMode?.profileId ?? null;
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
    // Refetch on page entry: an estimate edit on another page can advance the
    // projection while this hook is unmounted; returning within staleTime would
    // otherwise serve the stale cached list. Stable key => background refetch
    // keeps prior rows visible (no empty flash).
    refetchOnMount: "always",
    // P2: local opt-in (global default stays false — App-level form-reset
    // rationale). Another session's write while this tab was backgrounded
    // must surface on return; staleTime bounds the churn.
    refetchOnWindowFocus: true,
  });

  usePlanningProjectionInvalidation(
    projectId,
    supabaseMode?.profileId ?? null,
    estimateSync.domains.tasks.projectedRevision ?? null,
  );

  const remoteTasks = tasksQuery.data ?? EMPTY_PLANNING_TASKS;
  const derivedTasks = useMemo(() => {
    const rawTasks = mode.kind === "demo" || mode.kind === "local"
      ? demoTasks
      : remoteTasks;

    if (!supabaseProfileId || rawTasks.length === 0) {
      return rawTasks;
    }

    const linesByWorkId = new Map<string, typeof estimateState.lines>();
    estimateState.lines.forEach((line) => {
      const rows = linesByWorkId.get(line.workId) ?? [];
      rows.push(line);
      linesByWorkId.set(line.workId, rows);
    });

    return rawTasks.map((task) => {
      if (!task.estimateV2WorkId) {
        return task;
      }

      const linesForWork = linesByWorkId.get(task.estimateV2WorkId) ?? [];
      const assignees = deriveEstimateTaskAssignees(
        pickEstimateLinesForTaskAssigneeProjection(linesForWork),
      );
      if (assignees.length === 0) {
        return task;
      }

      return {
        ...task,
        assignee_id: getPrimaryEstimateTaskAssigneeId(assignees) ?? "",
        assignees,
      };
    });
  }, [demoTasks, estimateState.lines, mode.kind, remoteTasks, supabaseProfileId]);

  if (mode.kind === "demo" || mode.kind === "local") {
    return { tasks: derivedTasks, isLoading: false };
  }

  if (!supabaseMode) {
    return { tasks: EMPTY_PLANNING_TASKS, isLoading: mode.kind === "pending-supabase" };
  }

  return { tasks: derivedTasks, isLoading: tasksQuery.isPending };
}

export function usePlanningProjectTasks(projectId: string): Task[] {
  return usePlanningProjectTasksState(projectId).tasks;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Keeps array identity stable so it can be a query key and an effect dependency. */
function useStableStringArray(values: string[]): string[] {
  const valueRef = useRef(values);
  if (!areStringArraysEqual(valueRef.current, values)) {
    valueRef.current = values;
  }
  return valueRef.current;
}

/**
 * Per-project status inputs for the project lists: the estimate's execution
 * status (which IS the project's status) plus task tallies for the progress bar.
 * One pair of round-trips for the whole list, not one per project.
 */
export function useProjectsStatusSummary(
  projectIds: string[],
): Record<string, ProjectStatusSummary> {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const normalizedProjectIds = useStableStringArray(projectIds.filter(Boolean));
  const isBrowserMode = mode.kind === "demo" || mode.kind === "local";

  const readBrowserSummaries = useCallback(
    (): Record<string, ProjectStatusSummary> => Object.fromEntries(
      normalizedProjectIds.map((projectId) => [projectId, {
        executionStatus: getEstimateV2ProjectState(projectId).project.estimateStatus ?? null,
        estimateApproved: false,
        // Как и в браузерном источнике: ветка вывода здесь недостижима, потому
        // что estimateStatus у стора НЕнулевой. Разблокируется с rovno#165.
        hasLinkedEstimateChecklist: false,
        taskCounts: countTaskStatuses(store.getTasks(projectId)),
      }]),
    ),
    [normalizedProjectIds],
  );
  const [browserSummaries, setBrowserSummaries] = useState<Record<string, ProjectStatusSummary>>(
    () => (isBrowserMode ? readBrowserSummaries() : EMPTY_STATUS_SUMMARY_BY_PROJECT),
  );

  // Two stores feed one badge: tasks live in the workspace store, the execution
  // status in the estimate store. Subscribing to only one leaves the list stale
  // after a change made on the other side.
  useEffect(() => {
    if (!isBrowserMode) {
      setBrowserSummaries(EMPTY_STATUS_SUMMARY_BY_PROJECT);
      return;
    }
    const update = () => setBrowserSummaries(readBrowserSummaries());
    update();
    const unsubscribeStore = store.subscribe(update);
    const unsubscribeEstimates = subscribeEstimateV2(update);
    return () => {
      unsubscribeStore();
      unsubscribeEstimates();
    };
  }, [isBrowserMode, readBrowserSummaries]);

  const summaryQuery = useQuery({
    queryKey: supabaseMode
      ? planningQueryKeys.projectsStatusSummary(supabaseMode.profileId, normalizedProjectIds)
      : planningQueryKeys.projectsStatusSummary("browser", normalizedProjectIds),
    queryFn: async () => {
      const source = await getPlanningSource(supabaseMode ?? undefined);
      return source.getProjectsStatusSummary(normalizedProjectIds);
    },
    enabled: Boolean(supabaseMode && normalizedProjectIds.length > 0),
    staleTime: PLANNING_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    // Ключ несёт ВЕСЬ список идентификаторов, поэтому создание или удаление
    // проекта чеканит новый ключ и без этого обнуляло бы сводку по всем
    // остальным: проценты мигали бы 67 -> 0 -> 67. Прошлые данные держатся,
    // пока не доедут новые.
    placeholderData: keepPreviousData,
  });

  if (isBrowserMode) {
    return browserSummaries;
  }

  return summaryQuery.data ?? EMPTY_STATUS_SUMMARY_BY_PROJECT;
}
