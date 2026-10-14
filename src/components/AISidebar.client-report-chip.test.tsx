import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import enLocale from "@/locales/en.json";
import ruLocale from "@/locales/ru.json";

/**
 * The suite runs in local mode, where the client report is not offered. The
 * gate is switched here so the wiring behind it (chip shown, click opens the
 * dialog instead of seeding the composer) can be observed; the gate itself is
 * covered in lib/client-report-dialog.test.ts.
 */
const gate = { open: true };

vi.mock("@/lib/client-report-dialog", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-report-dialog")>(
    "@/lib/client-report-dialog",
  );
  return { ...actual, canOpenClientReport: () => gate.open };
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
const { __unsafeResetStoreForTests, addMember, addProject, addTask } = await import("@/data/store");
const { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } = await import(
  "@/lib/auth-state"
);
const { trackEvent } = await import("@/lib/analytics");
const { closeClientReportDialog, getClientReportDialogProjectId } = await import("@/lib/client-report-dialog");

const trackEventMock = vi.mocked(trackEvent);
const CHIP_TEXT = "Prepare a report for the client";
let projectSeq = 0;
let projectId = "";

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/project/${projectId}/dashboard`]}>
        <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByPlaceholderText("Ask Shurik...") as HTMLTextAreaElement;
}

describe("AISidebar client report chip", () => {
  afterEach(() => {
    cleanup();
    closeClientReportDialog();
  });

  beforeEach(() => {
    gate.open = true;
    trackEventMock.mockClear();
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({ email: "owner@example.com", name: "Owner User" });
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    projectSeq += 1;
    projectId = `project-client-report-${projectSeq}`;
    addProject({
      id: projectId,
      owner_id: profile.id,
      title: `Report ${projectSeq}`,
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
    // Every task done, so the opener shows the signal that carries this chip.
    addTask({
      id: `task-done-${projectSeq}`,
      project_id: projectId,
      stage_id: "",
      title: "Finished work",
      description: "",
      status: "done",
      assignee_id: "",
      checklist: [],
      comments: [],
      attachments: [],
      photos: [],
      linked_estimate_item_ids: [],
      created_at: new Date().toISOString(),
    });
  });

  it("is named after the report in both languages", () => {
    expect(ruLocale["ai.sidebar.suggestion.clientStatus"]).toBe("Собери отчёт для заказчика");
    expect(enLocale["ai.sidebar.suggestion.clientStatus"]).toBe(CHIP_TEXT);
  });

  it("opens the client report dialog for the project instead of writing a prompt", () => {
    const composer = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: CHIP_TEXT }));

    expect(getClientReportDialogProjectId()).toBe(projectId);
    expect(composer.value).toBe("");

    fireEvent.keyDown(composer, { key: "Enter" });
    expect(trackEventMock.mock.calls.filter(([name]) => name === "ai_prompt_submitted")).toHaveLength(0);
  });

  it("is not offered to a member who cannot open the dialog", () => {
    gate.open = false;
    renderSidebar();

    // Positive first: the opener rendered its other chips.
    expect(screen.getByRole("button", { name: "Write the closing report" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: CHIP_TEXT })).toBeNull();
    expect(getClientReportDialogProjectId()).toBeNull();
  });
});
