import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as planningSource from "@/data/planning-source";
import * as store from "@/data/store";
import { TasksTab } from "@/components/home/TasksTab";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { Project, Task } from "@/types/entities";

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(() => [] as Project[]),
  projectsState: vi.fn(() => ({ projects: [] as Project[], isLoading: false, isError: false })),
}));

vi.mock("@/hooks/use-workspace-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-workspace-source")>()),
  useWorkspaceProjectsState: mocks.projectsState,
}));

vi.mock("@/hooks/use-mock-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-mock-data")>()),
  useProjects: mocks.useProjects,
}));

function project(id: string, title: string): Project {
  return { id, title } as Project;
}

function task(partial: Partial<Task>): Task {
  return {
    id: "task-1",
    project_id: "project-a",
    stage_id: "stage-1",
    title: "Task",
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

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TasksTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function useProjectsFixture(projects: Project[], state: { isLoading?: boolean; isError?: boolean } = {}) {
  mocks.useProjects.mockReturnValue(projects);
  mocks.projectsState.mockReturnValue({
    projects,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
}

describe("TasksTab in Supabase mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    useProjectsFixture([]);
  });

  it("lists the tasks of every project from the planning source, not the demo store", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    useProjectsFixture([project("project-a", "Дом А"), project("project-b", "Дом Б")]);
    const getWorkspaceTasks = vi.fn(async () => [
      task({ id: "a-1", project_id: "project-a", title: "Залить фундамент" }),
      task({ id: "b-1", project_id: "project-b", title: "Поставить окна", status: "in_progress" }),
      task({ id: "b-2", project_id: "project-b", title: "Покрасить фасад", deadline: "2020-01-01" }),
      task({ id: "c-1", project_id: "project-c", title: "Задача ушедшего проекта" }),
    ]);
    const getProjectTasks = vi.fn();
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks,
      getProjectTasks,
    } as unknown as planningSource.PlanningSource);

    renderTab();

    const heading = await screen.findByRole("heading", { name: /\(3\)/ });
    const allTasksCard = heading.parentElement as HTMLElement;
    expect(within(allTasksCard).getByText("Залить фундамент")).toBeInTheDocument();
    expect(within(allTasksCard).getByText("Поставить окна")).toBeInTheDocument();
    expect(within(allTasksCard).getByText("Покрасить фасад")).toBeInTheDocument();
    expect(within(allTasksCard).getAllByText("Дом Б")).toHaveLength(2);
    expect(screen.queryByText("Задача ушедшего проекта")).toBeNull();
    expect(screen.getByRole("heading", { name: /\(1\)/ })).toBeInTheDocument();
    expect(getWorkspaceTasks).toHaveBeenCalledTimes(1);
    expect(getWorkspaceTasks).toHaveBeenCalledWith(["project-a", "project-b"]);
    expect(getProjectTasks).not.toHaveBeenCalled();
  });

  it("shows neither a zero count nor «no matches» while the projects are loading", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    useProjectsFixture([], { isLoading: true });
    const getWorkspaceTasks = vi.fn(async () => []);
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks,
    } as unknown as planningSource.PlanningSource);

    renderTab();

    const heading = await screen.findByRole("heading", { name: "Tasks" });
    expect(heading).toHaveTextContent(/^Tasks$/);
    expect(screen.queryByText("No tasks match the current filters.")).toBeNull();
    expect(getWorkspaceTasks).not.toHaveBeenCalled();
  });

  it("says the tasks failed to load instead of reporting none", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    useProjectsFixture([project("project-a", "Дом А")]);
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => {
        throw new Error("network");
      }),
    } as unknown as planningSource.PlanningSource);

    renderTab();

    expect(await screen.findByText("Could not load tasks. Refresh the page.")).toBeInTheDocument();
    expect(screen.queryByText("No tasks match the current filters.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Tasks" })).toHaveTextContent(/^Tasks$/);
  });

  it("does not offer a done toggle that would write to the demo store", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    useProjectsFixture([project("project-a", "Дом А")]);
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => [task({ id: "a-1", title: "Залить фундамент" })]),
    } as unknown as planningSource.PlanningSource);

    renderTab();

    const link = await screen.findByRole("link", { name: "Залить фундамент" });
    const row = link.parentElement as HTMLElement;
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("keeps reading the demo store, with its done toggle, in demo mode", async () => {
    useProjectsFixture([project("project-a", "Дом А")]);
    vi.spyOn(store, "getAllTasks").mockReturnValue([task({ id: "d-1", title: "Демо-задача" })]);
    const getPlanningSource = vi.spyOn(planningSource, "getPlanningSource");

    renderTab();

    const link = await screen.findByRole("link", { name: "Демо-задача" });
    expect(within(link.parentElement as HTMLElement).getByRole("button")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("Дом А").length).toBeGreaterThan(0);
    });
    expect(getPlanningSource).not.toHaveBeenCalled();
  });
});
