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

import ProjectLayout from "@/layouts/ProjectLayout";

function renderProjectLayout(path = "/project/project-1/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectLayout />}>
          <Route path="dashboard" element={<div>Dashboard content</div>} />
        </Route>
        <Route path="/auth/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
