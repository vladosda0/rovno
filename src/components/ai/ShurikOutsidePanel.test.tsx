import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShurikMessage } from "@/types/entities";

const { rpc, invoke, quota, projects, toastSpy } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  quota: { current: null as null | Record<string, unknown> },
  projects: { current: [] as { id: string; title: string }[] },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/ai-assistant-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-assistant-client")>();
  return { ...actual, invokeAssistantOutsideProject: (...args: unknown[]) => invoke(...args) };
});
vi.mock("@/hooks/use-toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-toast")>();
  return { ...actual, toast: (...args: unknown[]) => toastSpy(...args) };
});
vi.mock("@/hooks/useTierQuota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTierQuota")>();
  return { ...actual, useTierQuota: () => ({ data: quota.current }) };
});

vi.mock("@/hooks/use-mock-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-mock-data")>();
  return { ...actual, useProjects: () => projects.current };
});

import { SHURIK_OUTSIDE_CHAT_FEATURE, ShurikOutsidePanel } from "@/components/ai/ShurikOutsidePanel";
import { NEW_FEATURES } from "@/lib/new-features";
import { askShurik, takeProjectComposerSeed } from "@/lib/shurik-ask";
import { homeAnswerId, writeHomeAnswerRating } from "@/lib/ai-answer-rating";
import { readHomeChatSession, resetHomeChatSessionsForTests } from "@/lib/home-ai-chat";

const briefing: ShurikMessage = {
  id: "briefing-1",
  user_id: "profile-1",
  project_id: "p1",
  type: "briefing",
  title: "Планёрка · Ленина 42",
  body: "Сегодня срок: приёмка плитки.",
  is_read: true,
  read_at: null,
  created_at: "2026-10-09T06:00:00.000Z",
  payload: {},
};

function renderPanel(props: Partial<Parameters<typeof ShurikOutsidePanel>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LocationProbe />
        <ShurikOutsidePanel
          messages={[briefing]}
          unreadCount={0}
          onMarkRead={vi.fn()}
          onClose={vi.fn()}
          tab="chat"
          onTabChange={vi.fn()}
          chatProfileId="me"
          clientReportAvailable
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function historyOf(turns: unknown[]) {
  rpc.mockImplementation(async (name: string) =>
    name === "get_home_ai_chat_session"
      ? { data: { recentTurns: turns, rollingSummary: null }, error: null }
      : { data: null, error: null },
  );
}

describe("ShurikOutsidePanel", () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    quota.current = null;
    resetHomeChatSessionsForTests();
    projects.current = [];
    localStorage.clear();
    historyOf([]);
  });

  it("is a rounded card with «Chat» and «Notifications» tabs", async () => {
    renderPanel();
    const panel = screen.getByRole("complementary");
    expect(panel.className).toContain("md:rounded-panel");
    expect(panel.className).toContain("md:m-2");
    expect(within(panel).getByRole("tab", { name: /Chat/ })).toHaveAttribute("aria-selected", "true");
    expect(within(panel).getByRole("tab", { name: /Notifications/ })).toBeInTheDocument();
    expect(await screen.findByText(/I'll answer from the knowledge base/)).toBeInTheDocument();
  });

  it("puts the beta mark at the end of the disclaimer", async () => {
    renderPanel();
    const line = await screen.findByTestId("shurik-disclaimer");
    expect(line.lastElementChild).toHaveTextContent("beta");
    expect(line.textContent?.indexOf("beta")).toBeGreaterThan(10);
  });

  it("shows the shared conversation, a rating left earlier included", async () => {
    writeHomeAnswerRating("me", homeAnswerId("Уклон 0,5–1 %"), "good");
    historyOf([
      { role: "user", text: "Какой уклон?" },
      { role: "assistant", text: "Уклон 0,5–1 %", knowledgeBaseMissing: true },
    ]);
    renderPanel();
    expect(await screen.findByText("Уклон 0,5–1 %")).toBeInTheDocument();
    expect(screen.getByText("Какой уклон?")).toHaveClass("bg-accent");
    expect(screen.getByTestId("kb-missing")).toBeInTheDocument();
    expect(screen.getByTestId("shurik-bubble")).toBeInTheDocument();
    expect(screen.getByTitle("Rate good")).toHaveAttribute("aria-pressed", "true");
  });

  it("sends a question with no project and shows the answer with the actions row", async () => {
    invoke.mockResolvedValue({ explanation: "Ответ по базе", grounding: "ungrounded", sources: [] });
    renderPanel();
    const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
    fireEvent.change(box, { target: { value: "Вопрос" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText("Ответ по базе")).toBeInTheDocument();
    expect(invoke.mock.calls[0][0]).toMatchObject({ userMessage: "Вопрос" });
    expect(screen.getByText("Вопрос")).toHaveClass("bg-accent");
    for (const title of ["Copy", "Rate good", "Rate bad", "Save to Documents", "Regenerate"]) {
      expect(screen.getByTitle(title)).toBeInTheDocument();
    }
  });

  it("sends the rating with no project and takes it off on a second press", async () => {
    historyOf([
      { role: "user", text: "Какой уклон?" },
      { role: "assistant", text: "Ответ" },
    ]);
    renderPanel();
    await screen.findByText("Ответ");
    fireEvent.click(screen.getByTitle("Rate bad"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_ai_answer_rating", expect.objectContaining({
      p_rating: "down",
      p_project_id: null,
      p_question: "Какой уклон?",
      p_answer: "Ответ",
      p_message_id: homeAnswerId("Ответ"),
    })));
    fireEvent.click(screen.getByTitle("Rate bad"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_ai_answer_rating", expect.objectContaining({ p_rating: null })));
    expect(screen.getByTitle("Rate bad")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a failed answer on screen without the actions row", async () => {
    invoke.mockRejectedValue(new Error("Not allowed"));
    renderPanel();
    const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
    fireEvent.change(box, { target: { value: "Вопрос" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByTestId("shurik-bubble")).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByTitle("Rate good")).not.toBeInTheDocument();
  });

  it("registers the «New» mark of the chat tab", () => {
    expect(SHURIK_OUTSIDE_CHAT_FEATURE).toBe("shurik-outside-chat");
    expect(NEW_FEATURES.some((feature) => feature.id === SHURIK_OUTSIDE_CHAT_FEATURE)).toBe(true);
  });

  describe("a question about a project", () => {
    const four = ["Лесная", "Берёзки", "Дача", "Офис"].map((title, i) => ({ id: `p${i}`, title }));

    async function askAboutProject() {
      invoke.mockResolvedValue({ explanation: "текст сервера", grounding: "ungrounded", sources: [], needsProject: true });
      renderPanel();
      const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
      fireEvent.change(box, { target: { value: "Что у меня по смете?" } });
      fireEvent.keyDown(box, { key: "Enter" });
      await screen.findByText("This is a question about a specific project. Which one should I open?");
    }

    it("offers three projects and all projects, and carries the question into the one pressed", async () => {
      projects.current = four;
      await askAboutProject();
      expect(screen.queryByText("текст сервера")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Дача" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Офис" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All projects" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Берёзки" }));
      expect(screen.getByTestId("location")).toHaveTextContent("/project/p1/dashboard");
      expect(takeProjectComposerSeed("p1")).toBe("Что у меня по смете?");
    });

    it("leads to the project list", async () => {
      projects.current = four;
      await askAboutProject();
      fireEvent.click(screen.getByRole("button", { name: "All projects" }));
      expect(screen.getByTestId("location")).toHaveTextContent("/home?tab=projects");
    });

    it("offers to create one when there are none", async () => {
      await askAboutProject();
      expect(screen.getByRole("button", { name: "Create a project" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "All projects" })).not.toBeInTheDocument();
    });

    it("keeps the buttons on an answer read back from the conversation", async () => {
      projects.current = four;
      historyOf([
        { role: "user", text: "Что у меня по смете?" },
        { role: "assistant", text: "текст сервера", needsProject: true },
      ]);
      renderPanel();
      expect(await screen.findByRole("button", { name: "Лесная" })).toBeInTheDocument();
      expect(screen.getByText("This is a question about a specific project. Which one should I open?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Лесная" }));
      expect(takeProjectComposerSeed("p0")).toBe("Что у меня по смете?");
    });

    it("draws the same fixed answer twice without a key clash", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      projects.current = four;
      historyOf([
        { role: "user", text: "а" },
        { role: "assistant", text: "текст сервера", needsProject: true },
        { role: "user", text: "б" },
        { role: "assistant", text: "текст сервера", needsProject: true },
      ]);
      renderPanel();
      expect(await screen.findAllByRole("button", { name: "Лесная" })).toHaveLength(2);
      expect(error.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
      error.mockRestore();
    });
  });

  describe("a page of the base asking", () => {
    it("attaches what is open and sends it inside the question", async () => {
      invoke.mockResolvedValue({ explanation: "Ответ", grounding: "ungrounded", sources: [] });
      renderPanel();
      const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
      act(() => askShurik({ label: "СП 29.13330" }));
      expect(screen.getByText("In the conversation: СП 29.13330")).toBeInTheDocument();
      fireEvent.change(box, { target: { value: "Что тут главное?" } });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(await screen.findByText("Ответ")).toBeInTheDocument();
      expect(invoke.mock.calls[0][0].userMessage).toBe("About СП 29.13330: Что тут главное?");
      expect(screen.queryByText("In the conversation: СП 29.13330")).not.toBeInTheDocument();
    });

    it("sends a quote with its clause at once when a question came with it", async () => {
      invoke.mockResolvedValue({ explanation: "Ответ", grounding: "ungrounded", sources: [] });
      renderPanel();
      await screen.findByRole("textbox", { name: "Ask Shurik..." });
      act(() => askShurik({ label: "СП 29.13330, п. 4.5", quote: "0,5 – 1 %", question: "А плитка?" }));
      expect(await screen.findByText("Ответ")).toBeInTheDocument();
      expect(invoke.mock.calls[0][0].userMessage).toBe("«0,5 – 1 %» · СП 29.13330, п. 4.5\nА плитка?");
    });

    it("takes an ask made before the panel was open", async () => {
      askShurik({ label: "СП 71", quote: "цитата" });
      renderPanel();
      expect(await screen.findByText("цитата")).toBeInTheDocument();
    });
  });

  describe("exchanges of this visit against the server's history", () => {
    // A server that writes the turn before it answers, as ai-inference does.
    let server: { role: string; text: string }[];
    function serve() {
      server = [];
      rpc.mockImplementation(async (name: string) =>
        name === "get_home_ai_chat_session"
          ? { data: { recentTurns: server.slice(-40), rollingSummary: null }, error: null }
          : { data: null, error: null },
      );
      invoke.mockImplementation(async ({ userMessage }: { userMessage: string }) => {
        const explanation = `ответ на ${userMessage}`;
        server.push({ role: "user", text: userMessage }, { role: "assistant", text: explanation });
        return { explanation, grounding: "ungrounded", sources: [] };
      });
    }
    async function say(text: string) {
      const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
      fireEvent.change(box, { target: { value: text } });
      fireEvent.keyDown(box, { key: "Enter" });
    }
    const settled = () => expect(readHomeChatSession("me").exchanges).toEqual([]);

    beforeEach(serve);

    it("shows each turn once after the server's read, with the bot writing between the site's turns", async () => {
      renderPanel();
      await say("один");
      await screen.findByText("ответ на один");
      await waitFor(settled);
      server.push({ role: "user", text: "из бота" }, { role: "assistant", text: "ответ боту" });
      await say("два");
      await screen.findByText("ответ на два");
      await waitFor(settled);
      expect(screen.getAllByText("ответ на один")).toHaveLength(1);
      expect(screen.getByText("ответ боту")).toBeInTheDocument();
    });

    it("keeps an answer the server did not write, after the history", async () => {
      invoke.mockImplementation(async ({ userMessage }: { userMessage: string }) => {
        server.push({ role: "user", text: "раньше" }, { role: "assistant", text: "старый ответ" });
        return { explanation: `не записан ${userMessage}`, grounding: "ungrounded", sources: [] };
      });
      renderPanel();
      await say("личное");
      await screen.findByText("старый ответ");
      expect(screen.getByText("не записан личное")).toBeInTheDocument();
      expect(screen.getByText("личное")).toBeInTheDocument();
    });

    it("answers the same question twice and shows both", async () => {
      renderPanel();
      await say("повтор");
      await screen.findByText("ответ на повтор");
      await waitFor(settled);
      await say("повтор");
      await waitFor(() => expect(screen.getAllByText("ответ на повтор")).toHaveLength(2));
      await waitFor(settled);
      expect(screen.getAllByText("ответ на повтор")).toHaveLength(2);
    });

    it("stays whole past twenty exchanges in one visit", async () => {
      renderPanel();
      for (let i = 1; i <= 23; i += 1) {
        await say(`вопрос ${i}`);
        await screen.findByText(`ответ на вопрос ${i}`);
        await waitFor(settled);
      }
      expect(screen.getAllByText("ответ на вопрос 23")).toHaveLength(1);
      expect(screen.getAllByText("ответ на вопрос 4")).toHaveLength(1);
      expect(screen.queryByText("ответ на вопрос 3")).not.toBeInTheDocument();
    }, 20_000);

    it("shows a failure in place, and the next success closes it", async () => {
      invoke.mockRejectedValueOnce(new Error("Not allowed"));
      renderPanel();
      await say("сбойный");
      expect(await screen.findByText("Not allowed")).toBeInTheDocument();
      expect(screen.getByText("сбойный")).toBeInTheDocument();
      await say("следующий");
      await screen.findByText("ответ на следующий");
      await waitFor(settled);
      expect(screen.queryByText("Not allowed")).not.toBeInTheDocument();
    });

    it("regenerates as an exchange that does not repeat the question on screen", async () => {
      renderPanel();
      await say("вопрос");
      await screen.findByText("ответ на вопрос");
      await waitFor(settled);
      invoke.mockImplementationOnce(async ({ userMessage }: { userMessage: string }) => {
        server.push({ role: "user", text: userMessage }, { role: "assistant", text: "другой ответ" });
        return { explanation: "другой ответ", grounding: "ungrounded", sources: [] };
      });
      fireEvent.click(screen.getByTitle("Regenerate"));
      expect(await screen.findByText("другой ответ")).toBeInTheDocument();
      expect(readHomeChatSession("me").exchanges[0]?.hideQuestion ?? true).toBe(true);
      await waitFor(settled);
    });

    it("loses nothing when the panel closes with an answer on its way", async () => {
      let answer: () => void = () => {};
      invoke.mockImplementationOnce(({ userMessage }: { userMessage: string }) => new Promise((resolve) => {
        answer = () => {
          server.push({ role: "user", text: userMessage }, { role: "assistant", text: "пришёл" });
          resolve({ explanation: "пришёл", grounding: "ungrounded", sources: [] });
        };
      }));
      const first = renderPanel();
      await say("в полёте");
      await screen.findByText("в полёте");
      first.unmount();
      await act(async () => {
        answer();
      });
      renderPanel();
      expect(await screen.findByText("пришёл")).toBeInTheDocument();
      await waitFor(settled);
      expect(screen.getAllByText("пришёл")).toHaveLength(1);
    });

    it("keeps a failure that came while the panel was closed", async () => {
      let reject: (error: Error) => void = () => {};
      invoke.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
      const first = renderPanel();
      await say("в полёте");
      await screen.findByText("в полёте");
      first.unmount();
      await act(async () => {
        reject(new Error("Not allowed"));
      });
      renderPanel();
      expect(await screen.findByText("в полёте")).toBeInTheDocument();
      expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    });

    it("says Shurik is busy when a send is refused during an answer", async () => {
      invoke.mockImplementationOnce(() => new Promise(() => {}));
      renderPanel();
      await say("первый");
      await waitFor(() => expect(readHomeChatSession("me").pending).toBe(true));
      await say("второй");
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Shurik is busy" }));
      expect(invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe("review round 1", () => {
    async function ask(text: string) {
      const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
      fireEvent.change(box, { target: { value: text } });
      fireEvent.keyDown(box, { key: "Enter" });
    }

    it("shows no intro while the history loads, a line when it failed, and sending still works", async () => {
      let fail: (value: unknown) => void = () => {};
      rpc.mockImplementation((name: string) => name === "get_home_ai_chat_session"
        ? new Promise((resolve) => { fail = resolve; })
        : Promise.resolve({ data: null, error: null }));
      invoke.mockResolvedValue({ explanation: "Ответ", grounding: "ungrounded", sources: [] });
      renderPanel();
      expect(await screen.findByRole("textbox", { name: "Ask Shurik..." })).toBeInTheDocument();
      expect(screen.queryByText(/I'll answer from the knowledge base/)).not.toBeInTheDocument();
      expect(screen.getByTestId("shurik-chat-loading")).toBeInTheDocument();
      await act(async () => {
        fail({ data: null, error: new Error("down") });
      });
      expect(await screen.findByText("Couldn't load the conversation. Try opening the panel again.")).toBeInTheDocument();
      expect(screen.queryByText(/I'll answer from the knowledge base/)).not.toBeInTheDocument();
      await ask("Вопрос");
      expect(await screen.findByText("Ответ")).toBeInTheDocument();
    });

    it("scrolls to the last turn when the chat tab is shown", async () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      historyOf([{ role: "user", text: "Q" }, { role: "assistant", text: "A" }]);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const tree = (tab: "chat" | "notifications") => (
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ShurikOutsidePanel
              messages={[]} unreadCount={0} onMarkRead={vi.fn()} onClose={vi.fn()}
              tab={tab} onTabChange={vi.fn()} chatProfileId="me"
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
      const view = render(tree("notifications"));
      await waitFor(() => expect(rpc).toHaveBeenCalled());
      await act(async () => {});
      scroll.mockClear();
      view.rerender(tree("chat"));
      expect(scroll).toHaveBeenCalled();
    });

    it("a question from a page keeps the draft and the attachment", async () => {
      invoke.mockResolvedValue({ explanation: "Ответ", grounding: "ungrounded", sources: [] });
      renderPanel();
      const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
      act(() => askShurik({ label: "СП 71" }));
      fireEvent.change(box, { target: { value: "черновик" } });
      act(() => askShurik({ label: "СП 29, п. 4", quote: "цитата", question: "А плитка?" }));
      expect(await screen.findByText("Ответ")).toBeInTheDocument();
      expect(box).toHaveValue("черновик");
      expect(screen.getByText("In the conversation: СП 71")).toBeInTheDocument();
    });

    it("a question from a page during an answer lands in the field, in front of the draft", async () => {
      invoke.mockImplementation(() => new Promise(() => {}));
      renderPanel();
      const box = await screen.findByRole("textbox", { name: "Ask Shurik..." });
      await ask("Первый");
      fireEvent.change(box, { target: { value: "черновик" } });
      act(() => askShurik({ label: "СП 29", quote: "цитата", question: "А плитка?" }));
      expect(invoke).toHaveBeenCalledTimes(1);
      expect((box as HTMLTextAreaElement).value).toBe("«цитата» · СП 29\nА плитка?\nчерновик");
    });

    it("the selection window stays with its text while an answer is on the way", async () => {
      invoke.mockResolvedValueOnce({ explanation: "Ответ", grounding: "ungrounded", sources: [] });
      renderPanel();
      await ask("Вопрос");
      const answer = await screen.findByText("Ответ");
      invoke.mockImplementation(() => new Promise(() => {}));
      await ask("Второй");
      const spy = vi.spyOn(window, "getSelection").mockReturnValue({
        isCollapsed: false, rangeCount: 1, anchorNode: answer.firstChild, focusNode: answer.firstChild,
        toString: () => "Отв", getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 1, bottom: 1 }) }),
      } as unknown as Selection);
      fireEvent.mouseUp(answer);
      const dialog = await screen.findByTestId("shurik-selection-ask");
      spy.mockRestore();
      fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "почему?" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
      expect(screen.getByTestId("shurik-selection-ask")).toBeInTheDocument();
      expect(within(screen.getByTestId("shurik-selection-ask")).getByRole("textbox")).toHaveValue("почему?");
      expect(invoke).toHaveBeenCalledTimes(2);
    });

    it("«All projects» tells the panel a page was opened, a project button does not", async () => {
      const onAction = vi.fn();
      projects.current = [{ id: "p0", title: "Лесная" }];
      historyOf([{ role: "user", text: "смета?" }, { role: "assistant", text: "x", needsProject: true }]);
      renderPanel({ onAction });
      fireEvent.click(await screen.findByRole("button", { name: "Лесная" }));
      expect(onAction).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "All projects" }));
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("limit reached", () => {
    beforeEach(() => {
      quota.current = {
        plan_code: "free",
        period_end: "2026-12-01T00:00:00Z",
        ai_chat_used: 50, ai_chat_limit: 50,
        ai_doc_used: 0, ai_doc_limit: 5,
        ai_photo_used: 0, ai_photo_limit: 5,
      };
    });

    it("replaces the field with the card and stands Shurik above it in an empty conversation", async () => {
      renderPanel();
      expect(await screen.findByRole("alert")).toHaveAccessibleName("AI chat limit reached");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      const figure = await screen.findByTestId("shurik-quota-figure");
      expect(within(figure).getByRole("presentation", { hidden: true }).getAttribute("src")).toBe("/shurik/working.png");
    });

    it("keeps the conversation on screen, with no figure over it", async () => {
      historyOf([{ role: "user", text: "Q" }, { role: "assistant", text: "A" }]);
      renderPanel();
      expect(await screen.findByText("A")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByTestId("shurik-quota-figure")).not.toBeInTheDocument();
    });
  });

  it("the notifications tab works as before, with no chat in demo", () => {
    renderPanel({ tab: "notifications", chatProfileId: null });
    expect(screen.queryByRole("tab", { name: /Chat/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Client report" })).toBeInTheDocument();
  });

  it("offers no «Client report» where the report cannot be opened", () => {
    renderPanel({ tab: "notifications", clientReportAvailable: false });
    expect(screen.queryByRole("button", { name: "Client report" })).not.toBeInTheDocument();
  });
});
