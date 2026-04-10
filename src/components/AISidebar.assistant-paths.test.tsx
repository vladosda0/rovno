import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Radix Select in jsdom: pointer capture + scrollIntoView used by focus management.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { liveFlag, invokeLiveTextAssistantMock } = vi.hoisted(() => {
  const liveFlag = { current: false };
  const invokeLiveTextAssistantMock = vi.fn(async () => ({
    explanation: "LIVE_ASSISTANT_EXPLANATION_BODY",
    grounding: "project_context_grounded" as const,
    sources: [{ kind: "project_summary" as const, label: "SRC_PROJECT_A" }],
    workProposal: {
      proposalTitle: "PREVIEW_TITLE",
      proposalSummary: "PREVIEW_SUMMARY",
      suggestedWorkItems: [{ label: "PREVIEW_LINE", note: "PREVIEW_NOTE" }],
    },
  }));
  return { liveFlag, invokeLiveTextAssistantMock };
});

vi.mock("@/lib/ai-live-text-assistant-feature", () => ({
  isLiveTextAssistantEnabled: () => liveFlag.current,
}));

vi.mock("@/lib/ai-assistant-client", () => ({
  invokeLiveTextAssistant: (...args: unknown[]) => invokeLiveTextAssistantMock(...args),
}));

import { AISidebar } from "@/components/AISidebar";
import * as AiProjectContext from "@/lib/ai-project-context";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function setupOwnerWithProjects() {
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
  addMember({
    project_id: "project-a",
    user_id: profile.id,
    role: "owner",
    ai_access: "project_pool",
    credit_limit: 500,
    used_credits: 0,
  });
}

describe("AISidebar assistant paths", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    liveFlag.current = false;
    invokeLiveTextAssistantMock.mockClear();
    vi.spyOn(AiProjectContext, "buildAIProjectContext");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("live text assistant (flag on)", () => {
    beforeEach(() => {
      liveFlag.current = true;
      setupOwnerWithProjects();
    });

    it("uses buildAIProjectContext for invokeLiveTextAssistant, shows grounding + preview CTA, and does not open legacy proposal queue", async () => {
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByPlaceholderText("Ask AI...");
      fireEvent.change(composer, { target: { value: "estimate scope question" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      await waitFor(() => {
        expect(AiProjectContext.buildAIProjectContext).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(invokeLiveTextAssistantMock).toHaveBeenCalled();
      });

      const invokeArg = invokeLiveTextAssistantMock.mock.calls[0]?.[0] as {
        projectId: string;
        contextPack: { project: { title: string } };
        userMessage: string;
      };
      expect(invokeArg.projectId).toBe("project-a");
      expect(invokeArg.contextPack.project.title).toBe("Project A");
      expect(invokeArg.userMessage).toBe("estimate scope question");

      expect(await screen.findByText("LIVE_ASSISTANT_EXPLANATION_BODY")).toBeInTheDocument();
      expect(screen.getByText(/Grounded on visible project context/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open estimate to apply manually/i })).toBeInTheDocument();
      expect(screen.queryByText(/I've prepared \d+ proposal/i)).not.toBeInTheDocument();
      expect(screen.queryByText("PREVIEW_TITLE")).toBeInTheDocument();
    });

    it("after /home project pick, live assistant receives context for the selected project (not stale pre-pick state)", async () => {
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/home"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByPlaceholderText("Ask AI...");
      fireEvent.change(composer, { target: { value: "add task for rough-in" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      expect(await screen.findByText(/Select a project below/i)).toBeInTheDocument();

      const combobox = screen.getByRole("combobox");
      fireEvent.click(combobox);

      const projectOption = await screen.findByRole("option", { name: /^Project A$/i, hidden: true });
      fireEvent.click(projectOption);

      await waitFor(() => {
        expect(invokeLiveTextAssistantMock).toHaveBeenCalled();
      });

      const invokeArg = invokeLiveTextAssistantMock.mock.calls[0]?.[0] as {
        projectId: string;
        contextPack: { project: { title: string } };
      };
      expect(invokeArg.projectId).toBe("project-a");
      expect(invokeArg.contextPack.project.title).toBe("Project A");
    });
  });

  describe("legacy proposal queue (flag off)", () => {
    beforeEach(() => {
      liveFlag.current = false;
      vi.useFakeTimers();
      setupOwnerWithProjects();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("still uses heuristic proposal queue messaging after the simulated generate delay", async () => {
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(invokeLiveTextAssistantMock).not.toHaveBeenCalled();

      const composer = screen.getByPlaceholderText("Ask AI...");
      fireEvent.change(composer, { target: { value: "add task for rough-in" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.getByText(/I've prepared \d+ proposal/i)).toBeInTheDocument();
      expect(screen.getByText(/Review them below/i)).toBeInTheDocument();
      expect(invokeLiveTextAssistantMock).not.toHaveBeenCalled();
    });
  });
});
