import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as planningSource from "@/data/planning-source";
import { OverviewTab } from "@/components/home/OverviewTab";
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
  useCurrentUser: () => null,
}));

vi.mock("@/hooks/use-activity-source", () => ({
  useProjectsRecentEventsState: () => ({ eventsByProject: {}, isSettled: true }),
}));

vi.mock("@/hooks/use-home-sensitive-detail-map", () => ({
  useWorkspaceProjectsSensitiveDetailMap: () => ({
    canViewSensitiveDetailByProjectId: new Map<string, boolean>(),
    isLoading: false,
  }),
}));

vi.mock("@/components/home/OrgBlock", () => ({ OrgBlock: () => null }));
vi.mock("@/components/home/PendingInvitationsBlock", () => ({ PendingInvitationsBlock: () => null }));

describe("OverviewTab upcoming tasks in Supabase mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("lists the projects' tasks from the planning source", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    const projects = [{ id: "project-a", title: "Дом А", progress_pct: 0 } as Project];
    mocks.useProjects.mockReturnValue(projects);
    mocks.projectsState.mockReturnValue({ projects, isLoading: false, isError: false });
    const remoteTask = {
      id: "a-1",
      project_id: "project-a",
      stage_id: "stage-1",
      title: "Поставить окна",
      description: "",
      status: "in_progress",
      assignee_id: "",
      checklist: [],
      comments: [],
      attachments: [],
      photos: [],
      linked_estimate_item_ids: [],
      created_at: "2026-03-01T00:00:00.000Z",
    } satisfies Task;
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => [remoteTask]),
      getProjectsStatusSummary: vi.fn(async () => ({})),
    } as unknown as planningSource.PlanningSource);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OverviewTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const link = await screen.findByRole("link", { name: /Поставить окна/ });
    expect(link).toHaveAttribute("href", "/project/project-a/tasks");
    expect(link).toHaveTextContent("Дом А");
  });

  it("says the tasks failed to load instead of «no upcoming tasks»", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    const projects = [{ id: "project-a", title: "Дом А", progress_pct: 0 } as Project];
    mocks.useProjects.mockReturnValue(projects);
    mocks.projectsState.mockReturnValue({ projects, isLoading: false, isError: false });
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => {
        throw new Error("network");
      }),
      getProjectsStatusSummary: vi.fn(async () => ({})),
    } as unknown as planningSource.PlanningSource);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OverviewTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Could not load tasks. Refresh the page.")).toBeInTheDocument();
    expect(screen.queryByText("No upcoming tasks")).toBeNull();
  });

  it("does not say «no upcoming tasks» while the tasks are loading", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    const projects = [{ id: "project-a", title: "Дом А", progress_pct: 0 } as Project];
    mocks.useProjects.mockReturnValue(projects);
    mocks.projectsState.mockReturnValue({ projects, isLoading: false, isError: false });
    const getWorkspaceTasks = vi.fn(() => new Promise<never>(() => {}));
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks,
      getProjectsStatusSummary: vi.fn(async () => ({})),
    } as unknown as planningSource.PlanningSource);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OverviewTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getWorkspaceTasks).toHaveBeenCalled());
    expect(screen.queryByText("No upcoming tasks")).toBeNull();
  });

  it("does not claim «no activity» while the project list is still loading", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    mocks.useProjects.mockReturnValue([]);
    mocks.projectsState.mockReturnValue({ projects: [], isLoading: true, isError: false });
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => []),
      getProjectsStatusSummary: vi.fn(async () => ({})),
    } as unknown as planningSource.PlanningSource);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OverviewTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Recent Activity" })).toBeInTheDocument();
    expect(screen.queryByText("No recent project activity yet.")).toBeNull();
  });

  it("says «no activity» once the projects loaded and have no events", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    const projects = [{ id: "project-a", title: "Дом А", progress_pct: 0 } as Project];
    mocks.useProjects.mockReturnValue(projects);
    mocks.projectsState.mockReturnValue({ projects, isLoading: false, isError: false });
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => []),
      getProjectsStatusSummary: vi.fn(async () => ({})),
    } as unknown as planningSource.PlanningSource);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OverviewTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("No recent project activity yet.")).toBeInTheDocument();
  });

  it("does not claim «no activity» when the project list failed to load", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    mocks.useProjects.mockReturnValue([]);
    mocks.projectsState.mockReturnValue({ projects: [], isLoading: false, isError: true });
    vi.spyOn(planningSource, "getPlanningSource").mockResolvedValue({
      getWorkspaceTasks: vi.fn(async () => []),
      getProjectsStatusSummary: vi.fn(async () => ({})),
    } as unknown as planningSource.PlanningSource);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OverviewTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Recent Activity" })).toBeInTheDocument();
    expect(screen.queryByText("No recent project activity yet.")).toBeNull();
  });
});
