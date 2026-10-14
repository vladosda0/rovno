import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ShurikHintOfDay } from "@/lib/shurik-hints";

/** What the server answered for today, and the cross. The hook itself is covered in use-shurik-hint.test.tsx. */
const today: { hint: ShurikHintOfDay | null; dismiss: ReturnType<typeof vi.fn> } = { hint: null, dismiss: vi.fn() };

vi.mock("@/hooks/use-shurik-hint", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-shurik-hint")>("@/hooks/use-shurik-hint");
  return { ...actual, useShurikHintOfDay: () => ({ hint: today.hint, dismiss: today.dismiss }) };
});

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackEventOncePerUser: vi.fn(),
  trackEventOncePerSession: vi.fn(),
  setAnalyticsUserId: vi.fn(),
  initMetrika: vi.fn(),
  ensureMetrikaStarted: vi.fn(),
  analyticsPageUrl: () => "http://localhost/",
  METRIKA_COUNTER_ID: null,
}));

const { AISidebar } = await import("@/components/AISidebar");
const { __unsafeResetStoreForTests, addMember, addProject } = await import("@/data/store");
const { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } = await import("@/lib/auth-state");

let projectSeq = 0;
let projectId = "";

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/project/${projectId}/dashboard`]}>
        <Routes>
          <Route
            path="*"
            element={(
              <>
                <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
                <Where />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByLabelText("Ask Shurik...") as HTMLTextAreaElement;
}

function hint(partial: Partial<ShurikHintOfDay> = {}): ShurikHintOfDay {
  return {
    day: "2026-10-15",
    hint_key: "T19",
    level: 2,
    params: { task_id: "t-7", task_title: "Kitchen wiring" },
    status: "active",
    ...partial,
  };
}

describe("AISidebar hint of the day", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    today.hint = null;
    today.dismiss = vi.fn();
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({ email: "owner@example.com", name: "Owner User" });
    setAuthRole("owner");
    __unsafeResetStoreForTests();
    projectSeq += 1;
    projectId = `project-hint-${projectSeq}`;
    addProject({
      id: projectId,
      owner_id: profile.id,
      title: `Hint ${projectSeq}`,
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
  });

  it("stands in the chat over the conversation, with one button that opens the task", () => {
    today.hint = hint();
    renderSidebar();

    const chat = screen.getByRole("tabpanel", { name: "Chat" });
    const card = within(chat).getByTestId("shurik-hint-card");
    expect(card).toHaveTextContent("The task “Kitchen wiring” has no assignee.");
    // The neutral line steps aside while the card speaks; the chips stay.
    expect(screen.queryByText(/^Ask about the project/)).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "Assign" }));
    expect(screen.getByTestId("where")).toHaveTextContent(`/project/${projectId}/tasks?task=t-7`);
  });

  it("calls the server to close it until tomorrow", () => {
    today.hint = hint();
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Close until tomorrow" }));
    expect(today.dismiss).toHaveBeenCalledTimes(1);
  });

  it("is not on the Notifications tab and adds nothing to its number", () => {
    today.hint = hint();
    renderSidebar();
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));
    const notifications = screen.getByRole("tabpanel", { name: "Notifications" });
    expect(within(notifications).queryByTestId("shurik-hint-card")).toBeNull();
    expect(screen.queryByTestId("shurik-unread-badge")).toBeNull();
  });

  it("without a hint shows the neutral line as before", () => {
    renderSidebar();
    expect(screen.queryByTestId("shurik-hint-card")).toBeNull();
    expect(screen.getByText(/^Ask about the project/)).toBeInTheDocument();
  });

  it("greets in the composer by the time of day and the first word of the name", () => {
    const composer = renderSidebar();
    expect(composer.placeholder).toMatch(/Owner/);
    expect(composer.placeholder).not.toBe("Ask Shurik...");
  });
});
