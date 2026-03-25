import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useWorkspaceModeMock, useWorkspaceProjectStateMock } = vi.hoisted(() => ({
  useWorkspaceModeMock: vi.fn(),
  useWorkspaceProjectStateMock: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: useWorkspaceModeMock,
  useWorkspaceProjectState: useWorkspaceProjectStateMock,
}));

const { usePermissionMock } = vi.hoisted(() => ({
  usePermissionMock: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return {
    ...actual,
    usePermission: usePermissionMock,
  };
});

import ProjectLayout from "@/layouts/ProjectLayout";

function renderProjectLayout(path = "/project/project-1/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectLayout />}>
          <Route path="dashboard" element={<div>Dashboard content</div>} />
          <Route path="estimate" element={<div>Estimate content</div>} />
          <Route path="procurement" element={<div>Procurement content</div>} />
          <Route path="hr" element={<div>HR content</div>} />
        </Route>
        <Route path="/auth/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePermissionMock.mockReturnValue({
      seam: {
        projectId: "project-1",
        profileId: "user-1",
        membership: null,
        project: undefined,
      },
      can: vi.fn(),
      role: "viewer",
    });
  });

  it("renders demo project routes without falling through to not-found", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    useWorkspaceProjectStateMock.mockReturnValue({
      project: undefined,
      isLoading: false,
    });

    renderProjectLayout();

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByText("Project not found")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("shows a skeleton while the supabase project query is still loading", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "supabase", profileId: "profile-1" });
    useWorkspaceProjectStateMock.mockReturnValue({
      project: undefined,
      isLoading: true,
    });

    const { container } = renderProjectLayout();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
    expect(screen.queryByText("Project not found")).not.toBeInTheDocument();
  });

  it("shows no-access fallback for estimate when sensitive access is denied", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    useWorkspaceProjectStateMock.mockReturnValue({
      project: undefined,
      isLoading: false,
    });

    usePermissionMock.mockReturnValue({
      seam: {
        projectId: "project-1",
        profileId: "user-1",
        membership: {
          project_id: "project-1",
          user_id: "user-1",
          role: "contractor",
          viewer_regime: null,
          ai_access: "consult_only",
          finance_visibility: "none",
          credit_limit: 0,
          used_credits: 0,
        },
        project: undefined,
      },
      can: vi.fn(),
      role: "contractor",
    });

    renderProjectLayout("/project/project-1/estimate");

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("Estimate content")).not.toBeInTheDocument();
  });
});
