import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTasks from "@/pages/project/ProjectTasks";

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  useTasks: vi.fn(),
  usePermission: vi.fn(),
  useMedia: vi.fn(),
  useWorkspaceMode: vi.fn(),
  useEstimateV2Project: vi.fn(),
  useMediaUploadMutations: vi.fn(),
}));

vi.mock("@/hooks/use-mock-data", () => ({
  useProject: mocks.useProject,
  useTasks: mocks.useTasks,
  usePermission: mocks.usePermission,
  useMedia: mocks.useMedia,
  useWorkspaceMode: mocks.useWorkspaceMode,
}));

vi.mock("@/hooks/use-estimate-v2-data", () => ({
  useEstimateV2Project: mocks.useEstimateV2Project,
}));

vi.mock("@/hooks/use-documents-media-source", () => ({
  useMediaUploadMutations: mocks.useMediaUploadMutations,
}));

vi.mock("@/data/store", () => ({
  getUserById: (id: string) => (id === "user-1" ? { id, name: "Owner" } : null),
  getCurrentUser: () => ({ id: "user-1", name: "Owner" }),
  updateTask: vi.fn(),
  addTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteStage: vi.fn(),
  completeStage: vi.fn(),
}));

vi.mock("@/data/planning-source", () => ({
  getPlanningSource: vi.fn(),
}));

vi.mock("@/data/estimate-store", () => ({
  createEstimateItemForTask: vi.fn(),
}));

vi.mock("@/lib/auth-state", () => ({
  getAuthRole: () => "owner",
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderProjectTasks() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/project/project-1/tasks"]}>
        <Routes>
          <Route path="/project/:id/tasks" element={<ProjectTasks />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectTasks", () => {
  beforeEach(() => {
    mocks.useProject.mockReturnValue({
      project: {
        id: "project-1",
        owner_id: "user-1",
        title: "Project One",
        type: "residential",
        project_mode: "contractor",
        automation_level: "manual",
        current_stage_id: "stage-1",
        progress_pct: 0,
      },
      stages: [
        {
          id: "stage-1",
          project_id: "project-1",
          title: "Stage One",
          description: "",
          order: 1,
          status: "open",
        },
      ],
      members: [
        {
          project_id: "project-1",
          user_id: "user-1",
          role: "owner",
          ai_access: "project_pool",
          credit_limit: 500,
          used_credits: 0,
        },
      ],
    });
    mocks.useTasks.mockReturnValue([
      {
        id: "task-1",
        project_id: "project-1",
        stage_id: "stage-1",
        estimateV2WorkId: "work-1",
        title: "Estimate task",
        description: "Desc",
        status: "not_started",
        assignee_id: "user-1",
        assignees: [{ id: "user-1", name: "Owner", email: null }],
        checklist: [],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ]);
    mocks.usePermission.mockReturnValue({ role: "owner", can: () => true });
    mocks.useMedia.mockReturnValue([]);
    mocks.useWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "user-1" });
    mocks.useEstimateV2Project.mockReturnValue({
      project: {
        regime: "contractor",
        estimateStatus: "in_work",
      },
      works: [],
      lines: [],
      stages: [],
      sync: {
        estimateRevision: "rev-1",
        domains: {
          tasks: { status: "synced", projectedRevision: "rev-1", lastAttemptedAt: null, lastSucceededAt: null, lastError: null },
          procurement: { status: "idle", projectedRevision: null, lastAttemptedAt: null, lastSucceededAt: null, lastError: null },
          hr: { status: "idle", projectedRevision: null, lastAttemptedAt: null, lastSucceededAt: null, lastError: null },
        },
      },
    });
    mocks.useMediaUploadMutations.mockReturnValue({
      prepareUpload: vi.fn(),
      uploadBytes: vi.fn(),
      finalizeUpload: vi.fn(),
    });
  });

  it("removes task and stage authoring controls in Supabase mode", () => {
    renderProjectTasks();

    expect(screen.queryByRole("button", { name: /New task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New stage/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stage One" }));

    expect(screen.queryByRole("button", { name: /Complete stage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Estimate task")).toBeInTheDocument();
  });
});
