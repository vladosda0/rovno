import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { AISidebar } from "@/components/AISidebar";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function SidebarHarness() {
  const navigate = useNavigate();

  return (
    <div>
      <button type="button" onClick={() => navigate("/project/project-a/dashboard")}>Project A</button>
      <button type="button" onClick={() => navigate("/project/project-b/dashboard")}>Project B</button>
      <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
    </div>
  );
}

describe("AISidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    addProject({
      id: "project-a",
      owner_id: profile.id,
      title: "Project A",
      type: "residential",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addProject({
      id: "project-b",
      owner_id: profile.id,
      title: "Project B",
      type: "commercial",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: "project-a",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });
    addMember({
      project_id: "project-b",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });
  });

  it("keeps chat history scoped per project and restores it when switching back", async () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
          <SidebarHarness />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const composer = screen.getByPlaceholderText("Ask AI...");

    fireEvent.change(composer, { target: { value: "alpha history" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("alpha history")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Project B" }));
    expect(screen.queryByText("alpha history")).not.toBeInTheDocument();

    const projectBComposer = screen.getByPlaceholderText("Ask AI...");
    fireEvent.change(projectBComposer, { target: { value: "beta history" } });
    fireEvent.keyDown(projectBComposer, { key: "Enter" });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("beta history")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Project A" }));
    expect(screen.getByText("alpha history")).toBeInTheDocument();
    expect(screen.queryByText("beta history")).not.toBeInTheDocument();
  });
});
