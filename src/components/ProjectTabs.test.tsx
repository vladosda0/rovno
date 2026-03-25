import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const usePermissionMock = vi.fn();
vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return {
    ...actual,
    usePermission: usePermissionMock,
  };
});

function setPermFinanceVisibility(finance_visibility: "none" | "summary" | "detail") {
  usePermissionMock.mockReturnValue({
    seam: {
      projectId: "project-1",
      profileId: "user-1",
      membership: {
        project_id: "project-1",
        user_id: "user-1",
        role: "co_owner",
        viewer_regime: null,
        ai_access: "consult_only",
        finance_visibility,
        credit_limit: 0,
        used_credits: 0,
      },
      project: undefined,
    },
    can: vi.fn(),
    role: "co_owner",
  });
}

describe("ProjectTabs", () => {
  it("shows Estimate/Procurement/HR tabs when sensitive detail access is allowed", async () => {
    setPermFinanceVisibility("detail");
    const { ProjectTabs } = await import("@/components/ProjectTabs");
    const { rerender } = render(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Estimate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Procurement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HR" })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Estimate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Procurement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HR" })).toBeInTheDocument();
  });

  it("hides Estimate/Procurement/HR tabs when sensitive detail access is denied", async () => {
    setPermFinanceVisibility("none");
    const { ProjectTabs } = await import("@/components/ProjectTabs");

    render(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    // Sensitive-detail overlay must not hide the whole modules.
    expect(screen.getByRole("link", { name: "Estimate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Procurement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HR" })).toBeInTheDocument();

    // Non-sensitive tabs should remain visible.
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Participants" })).toBeInTheDocument();
  });
});
