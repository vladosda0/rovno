import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AISidebar } from "@/components/AISidebar";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";
import { generateProposalQueue } from "@/lib/ai-engine";

vi.mock("@/lib/ai-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-engine")>();
  return { ...actual, generateProposalQueue: vi.fn(actual.generateProposalQueue) };
});

function renderSidebar(projectId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/project/${projectId}/dashboard`]}>
        <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AISidebar legacy proposal timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(generateProposalQueue).mockClear();
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({ email: "owner@example.com", name: "Owner User" });
    setAuthRole("owner");
    __unsafeResetStoreForTests();
    for (const projectId of ["project-a", "project-b"]) {
      addProject({
        id: projectId,
        owner_id: profile.id,
        title: projectId,
        type: "residential",
        automation_level: "assisted",
        current_stage_id: "",
        progress_pct: 0,
      });
      addMember({
        project_id: projectId,
        user_id: profile.id,
        role: "owner",
        ai_access: "project_pool",
        credit_limit: 500,
        used_credits: 0,
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function send(text: string) {
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, { target: { value: text } });
    fireEvent.keyDown(composer, { key: "Enter" });
  }

  // Sidebar chat state is kept per project scope across mounts, so each case uses its own project.
  it("generates proposals when the sidebar stays mounted", () => {
    renderSidebar("project-a");
    send("add a task");

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(generateProposalQueue).toHaveBeenCalledTimes(1);
  });

  it("does not run proposal generation after the sidebar unmounts", () => {
    const { unmount } = renderSidebar("project-b");
    send("add a task");

    unmount();
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(generateProposalQueue).not.toHaveBeenCalled();
  });
});
