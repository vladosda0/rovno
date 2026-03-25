import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthSimulator } from "@/components/settings/AuthSimulator";
import { setAuthRole } from "@/lib/auth-state";
import type { Project, User } from "@/types/entities";

const useProjectsMock = vi.fn();
const useCurrentUserMock = vi.fn();
const useWorkspaceModeMock = vi.fn();

vi.mock("@/hooks/use-mock-data", () => ({
  useProjects: () => useProjectsMock(),
  useCurrentUser: () => useCurrentUserMock(),
  useWorkspaceMode: () => useWorkspaceModeMock(),
}));

vi.mock("@/data/store", () => ({
  addMember: vi.fn(),
  updateMember: vi.fn(),
}));

describe("AuthSimulator (DEV)", () => {
  beforeEach(() => {
    localStorage.clear();
    setAuthRole("owner");

    const mockProjects: Project[] = [
      {
        id: "project-1",
        owner_id: "user-1",
        title: "Project One",
        type: "residential",
        automation_level: "assisted",
        current_stage_id: "",
        progress_pct: 0,
      },
      {
        id: "project-2",
        owner_id: "user-1",
        title: "Project Two",
        type: "residential",
        automation_level: "assisted",
        current_stage_id: "",
        progress_pct: 0,
      },
    ];
    const mockUser: User = {
      id: "user-1",
      email: "owner@example.com",
      name: "Owner User",
      locale: "en",
      timezone: "UTC",
      plan: "pro",
      credits_free: 0,
      credits_paid: 0,
    };

    useProjectsMock.mockReturnValue(mockProjects);
    useCurrentUserMock.mockReturnValue(mockUser);
    useWorkspaceModeMock.mockReturnValue({ kind: "local" });
  });

  it("on /home requires project selection before applying", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<AuthSimulator />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Apply Role" })).toBeDisabled();
  });

  it("inside a project route locks project selector and allows applying", () => {
    render(
      <MemoryRouter initialEntries={["/project/project-1/dashboard"]}>
        <Routes>
          <Route path="/project/:id/*" element={<AuthSimulator />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Apply Role" })).not.toBeDisabled();

    const trigger = screen.getByText("Project One").closest("button");
    expect(trigger).not.toBeNull();
    expect(trigger).toBeDisabled();
  });
});

