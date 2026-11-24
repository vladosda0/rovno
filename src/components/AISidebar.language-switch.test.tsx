import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AISidebar } from "@/components/AISidebar";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
import i18n from "@/i18n";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

// The local store hands out fresh member arrays on every render, so the seam,
// and every callback that depends on it, is rebuilt each time. Hosted data comes
// through react-query, whose structural sharing keeps an unchanged seam stable.
// Keep it stable here too (by JSON value, enough for a seam of plain data), or a
// stale closure is hidden by an accidental rebuild.
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  const { useRef } = await import("react");
  return {
    ...actual,
    usePermission: (projectId: string) => {
      const result = actual.usePermission(projectId);
      const stableSeam = useRef(result.seam);
      if (JSON.stringify(stableSeam.current) !== JSON.stringify(result.seam)) {
        stableSeam.current = result.seam;
      }
      return { ...result, seam: stableSeam.current };
    },
  };
});

const PROJECT_ID = "project-language-switch";

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/project/${PROJECT_ID}/dashboard`]}>
        <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AISidebar after an interface language switch", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage("en");
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({ email: "owner@example.com", name: "Owner User" });
    setAuthRole("owner");
    __unsafeResetStoreForTests();
    addProject({
      id: PROJECT_ID,
      owner_id: profile.id,
      title: "Language switch",
      type: "residential",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: PROJECT_ID,
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage("en");
  });

  it("answers a proposal request in the new language", async () => {
    renderSidebar();

    await act(async () => {
      await i18n.changeLanguage("ru");
    });

    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, { target: { value: "add a task" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText(/^Я подготовил/)).toBeInTheDocument();
    expect(screen.queryByText(/^I've prepared/)).not.toBeInTheDocument();
  });
});
