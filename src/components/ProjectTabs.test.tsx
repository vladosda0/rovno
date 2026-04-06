import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/types/entities";

const usePermissionMock = vi.fn();
vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return {
    ...actual,
    usePermission: usePermissionMock,
  };
});

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

describe("ProjectTabs", () => {
  it("hides Participants and HR for contractors but shows other Phase 5 modules", async () => {
    setPermission("contractor");
    const { ProjectTabs } = await import("@/components/ProjectTabs");

    render(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Estimate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Procurement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documents" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "HR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Participants" })).not.toBeInTheDocument();
  });

  it("hides HR for viewers", async () => {
    setPermission("viewer");
    const { ProjectTabs } = await import("@/components/ProjectTabs");

    render(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "HR" })).not.toBeInTheDocument();
  });

  it("shows Participants and HR for co-owners", async () => {
    setPermission("co_owner");
    const { ProjectTabs } = await import("@/components/ProjectTabs");

    render(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Participants" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HR" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
  });
});
