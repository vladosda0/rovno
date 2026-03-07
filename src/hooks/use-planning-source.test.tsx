import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as planningSource from "@/data/planning-source";
import * as store from "@/data/store";
import { usePlanningProjectStages, usePlanningProjectTasks } from "@/hooks/use-planning-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import type { Stage, Task } from "@/types/entities";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function stage(partial: Partial<Stage> = {}): Stage {
  return {
    id: "stage-1",
    project_id: "project-1",
    title: "Stage One",
    description: "",
    order: 1,
    status: "open",
    ...partial,
  };
}

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "project-1",
    stage_id: "stage-1",
    title: "Task One",
    description: "",
    status: "not_started",
    assignee_id: "",
    checklist: [],
    comments: [],
    attachments: [],
    photos: [],
    linked_estimate_item_ids: [],
    created_at: "2026-03-01T00:00:00.000Z",
    ...partial,
  };
}

function PlanningProbe({ projectId }: { projectId: string }) {
  const stages = usePlanningProjectStages(projectId);
  const tasks = usePlanningProjectTasks(projectId);

  return (
    <div>
      <span data-testid="stage-count">{stages.length}</span>
      <span data-testid="task-count">{tasks.length}</span>
      <span data-testid="stage-titles">{stages.map((item) => item.title).join("|")}</span>
      <span data-testid="task-titles">{tasks.map((item) => item.title).join("|")}</span>
    </div>
  );
}

describe("usePlanningProjectStages/usePlanningProjectTasks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns demo store data and reacts to store subscription updates", async () => {
    const queryClient = createQueryClient();
    let currentStages = [stage({ title: "Stage One" })];
    let currentTasks = [task({ title: "Task One" })];
    const listeners = new Set<() => void>();

    const getStagesSpy = vi.spyOn(store, "getStages").mockImplementation(() => currentStages);
    const getTasksSpy = vi.spyOn(store, "getTasks").mockImplementation(() => currentTasks);
    vi.spyOn(store, "subscribe").mockImplementation((callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PlanningProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("stage-count")).toHaveTextContent("1");
    expect(screen.getByTestId("task-count")).toHaveTextContent("1");
    expect(screen.getByTestId("stage-titles")).toHaveTextContent("Stage One");
    expect(screen.getByTestId("task-titles")).toHaveTextContent("Task One");

    act(() => {
      currentStages = [stage({ title: "Stage Two", order: 2 })];
      currentTasks = [task({ title: "Task Two", stage_id: "stage-2" })];
      listeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(screen.getByTestId("stage-titles")).toHaveTextContent("Stage Two");
    });
    expect(screen.getByTestId("task-titles")).toHaveTextContent("Task Two");
    expect(getStagesSpy).toHaveBeenCalledWith("project-1");
    expect(getTasksSpy).toHaveBeenCalledWith("project-1");
  });

  it("returns empty arrays while Supabase planning data is loading, then mapped results", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    let resolveStages: (value: Stage[]) => void;
    let resolveTasks: (value: Task[]) => void;
    const stagesPromise = new Promise<Stage[]>((resolve) => {
      resolveStages = resolve;
    });
    const tasksPromise = new Promise<Task[]>((resolve) => {
      resolveTasks = resolve;
    });
    const getStagesSpy = vi.spyOn(store, "getStages");
    const getTasksSpy = vi.spyOn(store, "getTasks");
    const source = {
      mode: "supabase" as const,
      getProjectStages: vi.fn(() => stagesPromise),
      getProjectTasks: vi.fn(() => tasksPromise),
    };

    queryClient.setQueryData(workspaceQueryKeys.mode(), {
      kind: "supabase",
      profileId: "profile-1",
    });
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue(source);

    render(
      <QueryClientProvider client={queryClient}>
        <PlanningProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("stage-count")).toHaveTextContent("0");
    expect(screen.getByTestId("task-count")).toHaveTextContent("0");
    expect(getStagesSpy).not.toHaveBeenCalled();
    expect(getTasksSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveStages!([stage({ title: "Supabase Stage" })]);
      resolveTasks!([task({ title: "Supabase Task" })]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("stage-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("task-count")).toHaveTextContent("1");
    expect(screen.getByTestId("stage-titles")).toHaveTextContent("Supabase Stage");
    expect(screen.getByTestId("task-titles")).toHaveTextContent("Supabase Task");
    expect(source.getProjectStages).toHaveBeenCalledWith("project-1");
    expect(source.getProjectTasks).toHaveBeenCalledWith("project-1");
  });
});
