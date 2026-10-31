import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
  // Return the contract type (not the inferred literal shape) so tests can
  // resolve minimal results and other grounding states.
  const invokeLiveTextAssistantMock = vi.fn(async (
    ..._args: unknown[]
  ): Promise<import("@/lib/ai-assistant-contract").LiveTextAssistantResult> => ({
    explanation: "LIVE_ASSISTANT_EXPLANATION_BODY",
    grounding: "project_context_grounded",
    sources: [{ kind: "project_summary" as const, label: "SRC_PROJECT_A" }],
    workProposal: {
      proposalTitle: "PREVIEW_TITLE",
      proposalSummary: "PREVIEW_SUMMARY",
      suggestedWorkItems: [{ label: "PREVIEW_LINE", note: "PREVIEW_NOTE" }],
    },
  }));
  return { liveFlag, invokeLiveTextAssistantMock };
});

vi.mock("@/lib/ai-assistant-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-assistant-client")>();
  return {
    ...actual,
    invokeLiveTextAssistant: (...args: unknown[]) => invokeLiveTextAssistantMock(...args),
    shouldUseHostedLiveTextAssistantPath: () => liveFlag.current,
  };
});

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

      const composer = screen.getByLabelText("Ask Shurik...");
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
      expect(screen.getByText(/Using project context/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open estimate to apply manually/i })).toBeInTheDocument();
      expect(screen.queryByText(/I've prepared \d+ proposal/i)).not.toBeInTheDocument();
      expect(screen.queryByText("PREVIEW_TITLE")).toBeInTheDocument();
    });

    function renderProjectSidebar() {
      render(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    }

    async function askWithKnowledgeBase(knowledgeBase: unknown, grounding = "project_context_grounded") {
      invokeLiveTextAssistantMock.mockResolvedValueOnce({
        explanation: "LIVE_ASSISTANT_EXPLANATION_BODY",
        grounding,
        sources: [{ kind: "project_summary" as const, label: "SRC_PROJECT_A" }],
        workProposal: {
          proposalTitle: "PREVIEW_TITLE",
          proposalSummary: "PREVIEW_SUMMARY",
          suggestedWorkItems: [{ label: "PREVIEW_LINE", note: "PREVIEW_NOTE" }],
        },
        knowledgeBase,
      } as never);
      renderProjectSidebar();
      // The conversation of this project outlives a render: count what the new turn adds.
      const callouts = () => screen.queryAllByText(/Using (limited )?project context/i).length;
      const before = { callouts: callouts(), answers: screen.queryAllByText("LIVE_ASSISTANT_EXPLANATION_BODY").length };
      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "wall question" } });
      fireEvent.keyDown(composer, { key: "Enter" });
      await waitFor(() => {
        expect(screen.queryAllByText("LIVE_ASSISTANT_EXPLANATION_BODY").length).toBe(before.answers + 1);
      });
      return callouts() - before.callouts;
    }

    it("«not in the base» takes the place of the project grounding callout", async () => {
      const addedCallouts = await askWithKnowledgeBase({ sources: [], missing: true });
      expect(screen.getAllByTestId("kb-missing").length).toBeGreaterThan(0);
      expect(addedCallouts).toBe(0);
    });

    it("«not in the base» also replaces the limited-context callout of a snapshot-only answer", async () => {
      expect(await askWithKnowledgeBase({ sources: [], missing: true }, "partial")).toBe(0);
    });

    it("a sourced answer keeps the callout and «Ask about this clause» puts the quote before the draft", async () => {
      const addedCallouts = await askWithKnowledgeBase({
        missing: false,
        sources: [{
          docId: "SP-155",
          docSlug: "sp-163",
          docLabel: "СП 163.1325800",
          clause: "6.4.2.8",
          anchor: "p-6-4-2-8",
          checking: false,
          pendingAmendments: [],
          quote: "покрыты гидроизолирующим составом",
        }],
      });
      expect(addedCallouts).toBe(1);
      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "my draft" } });
      fireEvent.click(within(screen.getByTestId("kb-sources")).getByRole("button", { expanded: false }));
      fireEvent.click((await screen.findAllByRole("button", { name: /6\.4\.2\.8/ })).at(-1)!);
      fireEvent.click(await screen.findByRole("button", { name: /about this clause/i }));
      expect((composer as HTMLTextAreaElement).value).toBe(
        "«покрыты гидроизолирующим составом» · СП 163.1325800, cl. 6.4.2.8\nmy draft",
      );
    });

    it("shows the beta mark and the AI disclaimer under the project composer", () => {
      renderProjectSidebar();
      expect(screen.getByTestId("shurik-disclaimer")).toHaveTextContent(/beta/i);
    });

    it("sends GigaChat even when the browser remembers Qwen, and forgets that choice", async () => {
      localStorage.setItem("ai-sidebar-chat-model", "qwen");
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "which model answers" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      await waitFor(() => {
        expect(invokeLiveTextAssistantMock).toHaveBeenCalledTimes(1);
      });
      const invokeArg = invokeLiveTextAssistantMock.mock.calls[0]?.[0] as { llmProvider?: string };
      expect(invokeArg.llmProvider).toBe("gigachat");
      expect(localStorage.getItem("ai-sidebar-chat-model")).toBeNull();
    });

    it("offers no model choice in the composer menu", () => {
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Icon-only trigger, opened from the keyboard (jsdom has no PointerEvent for Radix).
      const composerMenu = document.querySelector("button[aria-haspopup='menu'] svg.lucide-plus")?.closest("button");
      if (!composerMenu) throw new Error("composer menu trigger not found");
      fireEvent.keyDown(composerMenu, { key: "Enter" });

      expect(screen.getByRole("menuitem", { name: "Learn mode" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Model" })).not.toBeInTheDocument();
      expect(screen.queryByText("Qwen")).not.toBeInTheDocument();
    });

    it("passes a UUID chatId on live assistant invoke (session continuity)", async () => {
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "first question" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      await waitFor(() => {
        expect(invokeLiveTextAssistantMock).toHaveBeenCalledTimes(1);
      });
      const first = invokeLiveTextAssistantMock.mock.calls[0]?.[0] as { chatId?: string };
      expect(first.chatId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      const stored = localStorage.getItem("rovno:ai-chat:project-a");
      expect(stored).toBe(first.chatId);
    });

    it("offers Try again on an evidence_unavailable failure and re-sends the same message once", async () => {
      const { aiInferenceFailureFrom } = await import("@/lib/ai-assistant-client");
      invokeLiveTextAssistantMock.mockRejectedValueOnce(aiInferenceFailureFrom("evidence_unavailable", "en"));
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "what is left on stage 2?" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      expect(
        await screen.findByText(
          "The project data could not be loaded, so the assistant did not answer. Please try again.",
        ),
      ).toBeInTheDocument();
      const userTextCount = screen.getAllByText("what is left on stage 2?").length;
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect((await screen.findAllByText("LIVE_ASSISTANT_EXPLANATION_BODY")).length).toBeGreaterThan(0);
      expect(invokeLiveTextAssistantMock).toHaveBeenCalledTimes(2);
      const second = invokeLiveTextAssistantMock.mock.calls[1]?.[0] as {
        userMessage: string;
        projectId: string;
        priorTurns: Array<{ role: string; text: string }>;
      };
      expect(second.userMessage).toBe("what is left on stage 2?");
      expect(second.projectId).toBe("project-a");
      const first = invokeLiveTextAssistantMock.mock.calls[0]?.[0] as { priorTurns: unknown };
      expect(second.priorTurns).toEqual(first.priorTurns);
      expect(screen.getAllByText("what is left on stage 2?")).toHaveLength(userTextCount);
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("withdraws Try again once another turn follows the failed one", async () => {
      const { aiInferenceFailureFrom } = await import("@/lib/ai-assistant-client");
      invokeLiveTextAssistantMock.mockRejectedValueOnce(aiInferenceFailureFrom("evidence_unavailable", "en"));
      render(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "what is left on stage 2?" } });
      fireEvent.keyDown(composer, { key: "Enter" });
      expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();

      await waitFor(() => {
        fireEvent.change(screen.getByLabelText("Ask Shurik..."), { target: { value: "and on stage 3?" } });
        fireEvent.keyDown(screen.getByLabelText("Ask Shurik..."), { key: "Enter" });
        expect(invokeLiveTextAssistantMock).toHaveBeenCalledTimes(2);
      }, { timeout: 4000 });
      expect((await screen.findAllByText("LIVE_ASSISTANT_EXPLANATION_BODY")).length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("offers no Try again for any other failure", async () => {
      invokeLiveTextAssistantMock.mockRejectedValueOnce(new Error("Not allowed for this project."));
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "what is left on stage 2?" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      expect(await screen.findByText("Not allowed for this project.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("shows no learn actions under a failure bubble", async () => {
      invokeLiveTextAssistantMock.mockRejectedValueOnce(new Error("Not allowed for this project."));
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composerMenu = document.querySelector("button[aria-haspopup='menu'] svg.lucide-plus")?.closest("button");
      if (!composerMenu) throw new Error("composer menu trigger not found");
      fireEvent.keyDown(composerMenu, { key: "Enter" });
      fireEvent.click(screen.getByRole("menuitem", { name: "Learn mode" }));

      // The project's thread outlives a test, so earlier answers may already carry the row.
      const titles = ["Copy", "Rate good", "Rate bad", "Save to Documents", "Regenerate"];
      const before = titles.map((title) => screen.queryAllByTitle(title).length);

      const composer = screen.getByLabelText("Ask Shurik to explain decisions and tradeoffs...");
      fireEvent.change(composer, { target: { value: "why cure a slab?" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      expect(await screen.findByText("Not allowed for this project.")).toBeInTheDocument();
      expect(titles.map((title) => screen.queryAllByTitle(title).length)).toEqual(before);
    });

    it("names the composer after the learn-mode hint while learn mode is on", () => {
      render(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(screen.getByRole("textbox", { name: "Ask Shurik..." })).toBeInTheDocument();

      const composerMenu = document.querySelector("button[aria-haspopup='menu'] svg.lucide-plus")?.closest("button");
      if (!composerMenu) throw new Error("composer menu trigger not found");
      fireEvent.keyDown(composerMenu, { key: "Enter" });
      fireEvent.click(screen.getByRole("menuitem", { name: "Learn mode" }));

      expect(
        screen.getByRole("textbox", { name: "Ask Shurik to explain decisions and tradeoffs..." }),
      ).toBeInTheDocument();
    });

    it("uses answer-focused work log copy for hosted consult turns", async () => {
      // The contract result type, not the mock's inferred return: the test
      // resolves a minimal result without sources/workProposal.
      let resolveAssistant!: (value: import("@/lib/ai-assistant-contract").LiveTextAssistantResult) => void;
      invokeLiveTextAssistantMock.mockImplementationOnce(() =>
        new Promise<import("@/lib/ai-assistant-contract").LiveTextAssistantResult>((resolve) => {
          resolveAssistant = resolve;
        })
      );
      const queryClient = createQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "what should I check next?" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      expect(await screen.findByText("Preparing answer")).toBeInTheDocument();
      expect(screen.queryByText("Estimating credits")).not.toBeInTheDocument();
      expect(screen.queryByText("Ready for review")).not.toBeInTheDocument();

      resolveAssistant?.({
        explanation: "DONE",
        grounding: "ungrounded",
      });
      const reply = await screen.findByText("DONE");
      expect(reply).toBeInTheDocument();

      const bubble = reply.closest('[data-testid="shurik-bubble"]') as HTMLElement;
      expect(bubble).not.toBeNull();
      expect(within(bubble).getByText("Shurik")).toBeInTheDocument();
      expect(bubble.querySelector("img")?.getAttribute("src")).toBe("/shurik/wink-ok.png");
      expect(screen.getByText("what should I check next?").closest('[data-testid="shurik-bubble"]')).toBeNull();
    });
  });

  describe("learn actions under lines written before the assistant call", () => {
    beforeEach(() => {
      setupOwnerWithProjects();
    });

    it.each([
      { readiness: { status: "blocked", gate: "unavailable" }, text: "Shurik can't use this project context right now (permissions unavailable)." },
      { readiness: { status: "blocked", gate: "loading" }, text: "Still loading your permissions for this project. Try again in a moment." },
      { readiness: { status: "no_project" }, text: "Project data is not available to Shurik yet. Try again shortly." },
    ] as const)("shows none for $readiness.status $readiness.gate", async ({ readiness, text }) => {
      liveFlag.current = true;
      render(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
            <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const composerMenu = document.querySelector("button[aria-haspopup='menu'] svg.lucide-plus")?.closest("button");
      if (!composerMenu) throw new Error("composer menu trigger not found");
      fireEvent.keyDown(composerMenu, { key: "Enter" });
      fireEvent.click(screen.getByRole("menuitem", { name: "Learn mode" }));

      const titles = ["Copy", "Rate good", "Rate bad", "Save to Documents", "Regenerate"];
      const before = titles.map((title) => screen.queryAllByTitle(title).length);

      vi.spyOn(AiProjectContext, "evaluateProjectTargetedSendReadiness").mockReturnValue(
        readiness as ReturnType<typeof AiProjectContext.evaluateProjectTargetedSendReadiness>,
      );
      const composer = screen.getByLabelText("Ask Shurik to explain decisions and tradeoffs...");
      fireEvent.change(composer, { target: { value: "why cure a slab?" } });
      fireEvent.keyDown(composer, { key: "Enter" });
      expect((await screen.findAllByText(text, undefined, { timeout: 5000 })).length).toBeGreaterThan(0);
      expect(titles.map((title) => screen.queryAllByTitle(title).length)).toEqual(before);
      expect(invokeLiveTextAssistantMock).not.toHaveBeenCalled();
    }, 10_000);
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

      const composer = screen.getByLabelText("Ask Shurik...");
      fireEvent.change(composer, { target: { value: "add task for rough-in" } });
      fireEvent.keyDown(composer, { key: "Enter" });

      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.getByText(/I've prepared \d+ proposal/i)).toBeInTheDocument();
      expect(screen.getByText(/Review them below/i)).toBeInTheDocument();
      expect(screen.getByText(/^Proposal 1\//).closest('[data-testid="shurik-bubble"]')).not.toBeNull();
      expect(invokeLiveTextAssistantMock).not.toHaveBeenCalled();
    });
  });

});
