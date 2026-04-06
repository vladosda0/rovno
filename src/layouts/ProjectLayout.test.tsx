import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/types/entities";

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

function setPermission(role: MemberRole) {
  usePermissionMock.mockReturnValue({
    seam: {
      projectId: "project-1",
      profileId: "user-1",
      membership: {
        project_id: "project-1",
        user_id: "user-1",
        role,
        viewer_regime: null,
        ai_access: "consult_only",
        finance_visibility: "summary",
        credit_limit: 0,
        used_credits: 0,
      },
      project: undefined,
    },
    can: vi.fn(),
    role,
    isLoading: false,
  });
}

function renderProjectLayout(path = "/project/project-1/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectLayout />}>
          <Route path="dashboard" element={<div>Dashboard content</div>} />
          <Route path="estimate" element={<div>Estimate content</div>} />
          <Route path="participants" element={<div>Participants content</div>} />
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
    useWorkspaceProjectStateMock.mockReturnValue({
      project: undefined,
      isLoading: false,
    });
  });

  it("renders demo project routes without falling through to not-found", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    setPermission("viewer");

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
    setPermission("owner");

    const { container } = renderProjectLayout();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("denies hidden participant routes for contractors", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    setPermission("contractor");

    renderProjectLayout("/project/project-1/participants");

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("Participants content")).not.toBeInTheDocument();
  });

  it("denies HR routes for viewers", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    setPermission("viewer");

    renderProjectLayout("/project/project-1/hr");

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("HR content")).not.toBeInTheDocument();
  });

  it("denies HR routes for contractors", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    setPermission("contractor");

    renderProjectLayout("/project/project-1/hr");

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("HR content")).not.toBeInTheDocument();
  });

  it("keeps estimate route accessible for contractors", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    setPermission("contractor");

    renderProjectLayout("/project/project-1/estimate");

    expect(screen.queryByText("No access")).not.toBeInTheDocument();
    expect(screen.getByText("Estimate content")).toBeInTheDocument();
  });
});
