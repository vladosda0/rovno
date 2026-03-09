import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProjectsTab } from "@/components/home/ProjectsTab";
import * as workspaceSource from "@/data/workspace-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import type { Member, Project, User } from "@/types/entities";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function currentUser(): User {
  return {
    id: "profile-1",
    email: "owner@example.com",
    name: "Owner User",
    locale: "en",
    timezone: "UTC",
    plan: "pro",
    credits_free: 10,
    credits_paid: 20,
  };
}

describe("ProjectsTab", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the workspace project mutation and seeds the Supabase caches before navigation", async () => {
    const queryClient = createQueryClient();
    const user = currentUser();
    const createdProject: Project = {
      id: "project-created",
      owner_id: user.id,
      title: "Untitled Project",
      type: "commercial",
      project_mode: "build_myself",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    };
    const createWorkspaceProjectSpy = vi.spyOn(workspaceSource, "createWorkspaceProject")
      .mockResolvedValue(createdProject);
    vi.spyOn(workspaceSource, "getWorkspaceSource").mockResolvedValue({
      mode: "supabase",
      getCurrentUser: async () => user,
      getProjects: async () => [createdProject],
      getProjectById: async () => createdProject,
      getProjectMembers: async () => [],
      getProjectInvites: async () => [],
    });

    queryClient.setQueryData(workspaceQueryKeys.mode(), {
      kind: "supabase",
      profileId: user.id,
    });
    queryClient.setQueryData(workspaceQueryKeys.currentUser(user.id), user);
    queryClient.setQueryData(workspaceQueryKeys.projects(user.id), []);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <LocationProbe />
          <Routes>
            <Route path="/home" element={<ProjectsTab />} />
            <Route path="/project/:id/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create manually" }));
    fireEvent.change(screen.getByDisplayValue("Residential"), {
      target: { value: "commercial" },
    });
    fireEvent.change(screen.getByDisplayValue("I'm a contractor working for a client"), {
      target: { value: "build_myself" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createWorkspaceProjectSpy).toHaveBeenCalledWith(
        { kind: "supabase", profileId: user.id },
        {
          title: "Untitled Project",
          type: "commercial",
          projectMode: "build_myself",
          ownerId: user.id,
        },
      );
    });

    const projectsKey = workspaceQueryKeys.projects(user.id);
    const projectKey = workspaceQueryKeys.project(user.id, createdProject.id);
    const membersKey = workspaceQueryKeys.projectMembers(user.id, createdProject.id);

    await waitFor(() => {
      expect(queryClient.getQueryData(projectsKey)).toEqual([createdProject]);
      expect(queryClient.getQueryData(projectKey)).toEqual(createdProject);
      expect(queryClient.getQueryData(membersKey)).toEqual<Member[]>([
        {
          project_id: createdProject.id,
          user_id: user.id,
          role: "owner",
          ai_access: "project_pool",
          credit_limit: 0,
          used_credits: 0,
        },
      ]);
      expect(screen.getByTestId("location")).toHaveTextContent("/project/project-created/dashboard");
    });
  });

  it("routes AI project creation through the workspace seam and seeds the Supabase caches", async () => {
    const queryClient = createQueryClient();
    const user = currentUser();
    const createdProject: Project = {
      id: "project-ai-created",
      owner_id: user.id,
      title: "Office Build-out",
      type: "commercial",
      project_mode: "contractor",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    };
    const createWorkspaceProjectSpy = vi.spyOn(workspaceSource, "createWorkspaceProject")
      .mockResolvedValue(createdProject);
    vi.spyOn(workspaceSource, "getWorkspaceSource").mockResolvedValue({
      mode: "supabase",
      getCurrentUser: async () => user,
      getProjects: async () => [createdProject],
      getProjectById: async () => createdProject,
      getProjectMembers: async () => [],
      getProjectInvites: async () => [],
    });

    queryClient.setQueryData(workspaceQueryKeys.mode(), {
      kind: "supabase",
      profileId: user.id,
    });
    queryClient.setQueryData(workspaceQueryKeys.currentUser(user.id), user);
    queryClient.setQueryData(workspaceQueryKeys.projects(user.id), []);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <LocationProbe />
          <Routes>
            <Route path="/home" element={<ProjectsTab />} />
            <Route path="/project/:id/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Describe your project/i), {
      target: { value: "Build out an office space" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(createWorkspaceProjectSpy).toHaveBeenCalledWith(
        { kind: "supabase", profileId: user.id },
        {
          title: "Office Build-out",
          type: "commercial",
          projectMode: "contractor",
          ownerId: user.id,
        },
        {
          bootstrapLocalProject: false,
        },
      );
    });

    const projectsKey = workspaceQueryKeys.projects(user.id);
    const projectKey = workspaceQueryKeys.project(user.id, createdProject.id);
    const membersKey = workspaceQueryKeys.projectMembers(user.id, createdProject.id);

    await waitFor(() => {
      expect(queryClient.getQueryData(projectsKey)).toEqual([createdProject]);
      expect(queryClient.getQueryData(projectKey)).toEqual(createdProject);
      expect(queryClient.getQueryData(membersKey)).toEqual<Member[]>([
        {
          project_id: createdProject.id,
          user_id: user.id,
          role: "owner",
          ai_access: "project_pool",
          credit_limit: 0,
          used_credits: 0,
        },
      ]);
      expect(screen.getByTestId("location")).toHaveTextContent("/project/project-ai-created/dashboard");
    });
  });
});
