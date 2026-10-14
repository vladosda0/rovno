import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHURIK_IDLE_WINK_PAUSE_MS, SHURIK_WINK_MS } from "@/components/ai/Shurik";
import { ShurikMessageList } from "@/components/ai/ShurikMessageList";
import { SHURIK_PANEL_TAB_IDS, ShurikPanelTabs } from "@/components/ai/ShurikPanelTabs";
import { ShurikUnreadBadge } from "@/components/ai/ShurikUnreadBadge";
import { formatShurikMessageTime } from "@/lib/shurik-message-time";
import type { ShurikMessage } from "@/types/entities";

function message(partial: Partial<ShurikMessage> = {}): ShurikMessage {
  return {
    id: "msg-1",
    user_id: "profile-1",
    project_id: null,
    type: "billing_payment_failed",
    title: "Не прошло списание за подписку",
    body: "Не прошло списание 2 990 ₽ за подписку. Автопродление выключено.",
    is_read: false,
    read_at: null,
    created_at: "2026-10-09T06:12:00.000Z",
    payload: { action_label: "Обновить карту", action_href: "/settings?tab=billing" },
    ...partial,
  };
}

function Where() {
  const location = useLocation();
  return (
    <>
      <span data-testid="where">{location.pathname + location.search}</span>
      <span data-testid="where-state">{JSON.stringify(location.state)}</span>
    </>
  );
}

function briefing(partial: Partial<ShurikMessage> = {}): ShurikMessage {
  return message({
    id: "briefing-1",
    project_id: "p1",
    type: "briefing",
    title: "Планёрка · Ленина 42",
    body: "Сегодня срок по 2 задачам: приёмка плитки и вывоз мусора.\nЗаказ «Брус 150×150» должен был прийти 5 октября, приёмки нет.",
    payload: {
      lines: [
        {
          parts: [
            { text: "Сегодня срок по 2 задачам: " },
            { text: "приёмка плитки", href: "/project/p1/tasks", task_id: "t1" },
            { text: " и " },
            { text: "вывоз мусора", href: "/project/p1/tasks", task_id: "t2" },
            { text: "." },
          ],
        },
        {
          parts: [
            { text: "Заказ «" },
            { text: "Брус 150×150", href: "/project/p1/procurement/order/o1" },
            { text: "» должен был прийти 5 октября, приёмки нет." },
          ],
        },
      ],
    },
    ...partial,
  });
}

function reminder(partial: Partial<ShurikMessage> = {}): ShurikMessage {
  return message({
    id: "reminder-1",
    project_id: "p1",
    type: "client_report_reminder",
    title: "Отчёт клиенту · Ленина 42",
    body: "За неделю закрыто 4 задачи и загружено 6 фото. Собрал из этого отчёт для клиента.",
    payload: { action_label: "Посмотреть отчёт", action_href: "/project/p1/dashboard?report=client", done: 4, photos: 6 },
    ...partial,
  });
}

function renderList(
  messages: ShurikMessage[],
  onMarkRead = vi.fn(),
  onAction = vi.fn(),
  clientReportAvailable = false,
) {
  const view = render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <ShurikMessageList
                messages={messages}
                onMarkRead={onMarkRead}
                onAction={onAction}
                clientReportAvailable={clientReportAvailable}
              />
              <Where />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...view, onMarkRead, onAction };
}

describe("ShurikMessageList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a money message in a bubble from Shurik with one button", () => {
    renderList([message()]);

    const row = screen.getByTestId("shurik-bubble");
    expect(row).toHaveTextContent("Shurik");
    expect(row).toHaveTextContent("Не прошло списание 2 990 ₽ за подписку. Автопродление выключено.");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Обновить карту" })).toBeInTheDocument();
  });

  it("shows a report reminder with its project line, its text and the button to the report window", () => {
    const { onAction } = renderList([reminder()]);

    expect(screen.getByTestId("shurik-message-title")).toHaveTextContent("Отчёт клиенту · Ленина 42");
    const row = screen.getByTestId("shurik-bubble");
    expect(row).toHaveTextContent("За неделю закрыто 4 задачи и загружено 6 фото. Собрал из этого отчёт для клиента.");
    expect(row.querySelector("img")!.getAttribute("src")).toBe("/shurik/avatar.png");

    fireEvent.click(screen.getByRole("button", { name: "Посмотреть отчёт" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/project/p1/dashboard?report=client");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("puts «Client report» under a briefing where the report can be opened, and nowhere else", () => {
    const first = renderList([briefing()], vi.fn(), vi.fn(), false);
    expect(screen.queryByRole("button", { name: "Client report" })).not.toBeInTheDocument();
    first.unmount();

    const { onAction } = renderList([briefing(), message(), briefing({ id: "briefing-2", project_id: null })], vi.fn(), vi.fn(), true);
    expect(screen.getAllByRole("button", { name: "Client report" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Client report" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/project/p1/dashboard?report=client");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("stands Shurik in the money pose for a money message: no wink, no sway, ever", () => {
    renderList([message()]);

    const figure = screen.getByTestId("shurik-bubble").querySelector("img")!;
    expect(figure.getAttribute("src")).toBe("/shurik/salute.png");
    expect(figure).not.toHaveClass("animate-shurik-pop");
    expect(figure.parentElement).not.toHaveClass("animate-shurik-sway");

    act(() => {
      vi.advanceTimersByTime((SHURIK_IDLE_WINK_PAUSE_MS + SHURIK_WINK_MS) * 3);
    });
    expect(figure.getAttribute("src")).toBe("/shurik/salute.png");
    expect(figure).not.toHaveClass("animate-shurik-pop");
  });

  it("keeps the usual figure for a message that is not about money", () => {
    renderList([message({ type: "deadline_soon", payload: {} })]);

    expect(screen.getByTestId("shurik-bubble").querySelector("img")!.getAttribute("src")).toBe("/shurik/avatar.png");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the first line when a message has no longer text", () => {
    renderList([message({ body: null })]);

    expect(screen.getByTestId("shurik-bubble")).toHaveTextContent("Не прошло списание за подписку");
  });

  it("marks what is unread as read once it is on screen, and keeps the unread stripe while it is looked at", () => {
    const read = message({ id: "msg-old", is_read: true, read_at: "2026-10-08T10:00:00.000Z" });
    const { onMarkRead, rerender } = renderList([message({ id: "msg-new" }), read]);

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onMarkRead).toHaveBeenCalledWith(["msg-new"]);
    expect(screen.getByTestId("shurik-message-msg-new")).toHaveAttribute("data-unread", "true");
    expect(screen.getByTestId("shurik-message-msg-old")).toHaveAttribute("data-unread", "false");

    // The write landed: the row comes back read, the stripe stays until the list is closed.
    rerender(
      <MemoryRouter>
        <ShurikMessageList
          messages={[message({ id: "msg-new", is_read: true, read_at: "2026-10-09T07:00:00.000Z" }), read]}
          onMarkRead={onMarkRead}
        />
      </MemoryRouter>,
    );
    expect(onMarkRead).toHaveBeenCalledTimes(1);
  });

  it("does not ask again for a message that comes back unread after it was asked for", () => {
    const onMarkRead = vi.fn();
    const list = (messages: ShurikMessage[]) => (
      <MemoryRouter>
        <ShurikMessageList messages={messages} onMarkRead={onMarkRead} />
      </MemoryRouter>
    );
    const { rerender } = render(list([message({ id: "msg-new" })]));

    rerender(list([message({ id: "msg-new", is_read: true, read_at: "2026-10-09T07:00:00.000Z" })]));
    rerender(list([message({ id: "msg-new" })]));
    expect(onMarkRead).toHaveBeenCalledTimes(1);

    rerender(list([message({ id: "msg-newer" }), message({ id: "msg-new" })]));
    expect(onMarkRead).toHaveBeenCalledTimes(2);
    expect(onMarkRead).toHaveBeenLastCalledWith(["msg-newer"]);
  });

  it("asks for nothing when everything is already read", () => {
    const { onMarkRead } = renderList([message({ is_read: true, read_at: "2026-10-08T10:00:00.000Z" })]);

    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("leaves a message unread while the browser tab is in the background", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { onMarkRead } = renderList([message()]);
    expect(onMarkRead).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onMarkRead).toHaveBeenCalledWith(["msg-1"]);
    visibility.mockRestore();
  });

  it("goes to the place inside the app the button names", () => {
    const { onAction } = renderList([message()]);

    fireEvent.click(screen.getByRole("button", { name: "Обновить карту" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/settings?tab=billing");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("says so when there is nothing", () => {
    renderList([]);

    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });
});

describe("ShurikMessageList, a briefing", () => {
  it("opens with the project line and lists the rest, naming tasks and orders as links", () => {
    renderList([briefing()]);

    const row = screen.getByTestId("shurik-bubble");
    expect(screen.getByTestId("shurik-briefing-title")).toHaveTextContent("Планёрка · Ленина 42");
    const items = within(row).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Сегодня срок по 2 задачам: приёмка плитки и вывоз мусора.");
    expect(items[1]).toHaveTextContent("Заказ «Брус 150×150» должен был прийти 5 октября, приёмки нет.");
    expect(within(row).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "приёмка плитки",
      "вывоз мусора",
      "Брус 150×150",
    ]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stands Shurik pointing at it, still", () => {
    vi.useFakeTimers();
    try {
      renderList([briefing()]);
      const figure = screen.getByTestId("shurik-bubble").querySelector("img")!;
      expect(figure.getAttribute("src")).toBe("/shurik/pointing.png");

      act(() => {
        vi.advanceTimersByTime((SHURIK_IDLE_WINK_PAUSE_MS + SHURIK_WINK_MS) * 3);
      });
      expect(figure.getAttribute("src")).toBe("/shurik/pointing.png");
      expect(figure).not.toHaveClass("animate-shurik-pop");
      expect(figure.parentElement).not.toHaveClass("animate-shurik-sway");
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the task on the project's tasks page from its name", () => {
    const { onAction } = renderList([briefing()]);

    fireEvent.click(screen.getByRole("link", { name: "вывоз мусора" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/project/p1/tasks");
    expect(screen.getByTestId("where-state")).toHaveTextContent(JSON.stringify({ openTaskId: "t2" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("goes to the page a link without a task names, carrying no task", () => {
    renderList([briefing()]);

    fireEvent.click(screen.getByRole("link", { name: "Брус 150×150" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/project/p1/procurement/order/o1");
    expect(screen.getByTestId("where-state")).toHaveTextContent("null");
  });

  it.each([
    "https://example.com/project/p1/tasks",
    "//example.com/tasks",
    "javascript:alert(1)",
    "/project/p1\ttasks",
    "project/p1/tasks",
    42,
  ])("writes a part as plain text when its address %j does not lead inside the app", (href) => {
    renderList([
      briefing({ payload: { lines: [{ parts: [{ text: "Сегодня срок: " }, { text: "приёмка плитки", href, task_id: "t1" }] }] } }),
    ]);

    expect(screen.getByRole("listitem")).toHaveTextContent("Сегодня срок: приёмка плитки");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["no lines", {}],
    ["lines that are not a list", { lines: "Сегодня срок" }],
    ["an empty list", { lines: [] }],
    ["a line without parts", { lines: [{ text: "Сегодня срок" }] }],
    ["a line with no parts in it", { lines: [{ parts: [] }] }],
    ["a part without text", { lines: [{ parts: [{ href: "/project/p1/tasks" }] }] }],
    ["a part that is not an object", { lines: [{ parts: ["Сегодня срок"] }] }],
    ["one good line and one broken", { lines: [{ parts: [{ text: "Сегодня срок." }] }, null] }],
  ])("shows the plain text instead when the payload has %s", (_name, payload) => {
    renderList([briefing({ payload })]);

    const row = screen.getByTestId("shurik-bubble");
    expect(screen.getByTestId("shurik-briefing-title")).toHaveTextContent("Планёрка · Ленина 42");
    expect(row).toHaveTextContent("Сегодня срок по 2 задачам: приёмка плитки и вывоз мусора.");
    expect(row).toHaveTextContent("приёмки нет.");
    expect(within(row).queryByRole("listitem")).not.toBeInTheDocument();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    expect(row.querySelector("img")!.getAttribute("src")).toBe("/shurik/pointing.png");
  });

  it("is one message per project, each read like any other", () => {
    const { onMarkRead } = renderList([
      briefing({ id: "briefing-2", project_id: "p2", title: "Планёрка · Дача, баня" }),
      briefing(),
    ]);

    expect(screen.getAllByTestId("shurik-bubble")).toHaveLength(2);
    expect(onMarkRead).toHaveBeenCalledWith(["briefing-2", "briefing-1"]);
  });
});

function comment(partial: Partial<ShurikMessage> = {}): ShurikMessage {
  return message({
    id: "people-1",
    project_id: "p1",
    type: "people_comment",
    title: "Комментарий · Ленина 42",
    body: "Иван Петров написал(а) в задаче «Штукатурка стен»: «Плитку привезут в четверг, не в среду.»",
    payload: {
      action_label: "Открыть",
      action_href: "/project/p1/tasks?task=t1",
      task_id: "t1",
      actor_id: "profile-2",
      comment_id: "c1",
    },
    ...partial,
  });
}

describe("ShurikMessageList, a message about what a person did", () => {
  it("shows the first line and the text of a comment, and opens the task from its button", () => {
    const { onAction } = renderList([comment()]);

    const row = screen.getByTestId("shurik-bubble");
    expect(screen.getByTestId("shurik-message-title")).toHaveTextContent("Комментарий · Ленина 42");
    expect(row).toHaveTextContent(
      "Иван Петров написал(а) в задаче «Штукатурка стен»: «Плитку привезут в четверг, не в среду.»",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/project/p1/tasks?task=t1");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows an assignment the same way", () => {
    renderList([
      comment({
        type: "people_assignment",
        title: "Назначение · Ленина 42",
        body: "Иван Петров назначил(а) тебе задачу «Приёмка плитки», срок 4 октября.",
      }),
    ]);

    expect(screen.getByTestId("shurik-message-title")).toHaveTextContent("Назначение · Ленина 42");
    expect(screen.getByTestId("shurik-bubble")).toHaveTextContent(
      "Иван Петров назначил(а) тебе задачу «Приёмка плитки», срок 4 октября.",
    );
  });

  it("opens the list of tasks from several assignments in one message", () => {
    renderList([
      comment({
        type: "people_assignment",
        title: "Назначение · Ленина 42",
        body: "Иван Петров назначил(а) тебе 3 задачи: «Демонтаж перегородок», «Штукатурка стен» и ещё 1.",
        payload: {
          action_label: "Открыть задачи",
          action_href: "/project/p1/tasks",
          task_ids: ["t1", "t2", "t3"],
          task_titles: ["Демонтаж перегородок", "Штукатурка стен", "Приёмка плитки"],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Открыть задачи" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/project/p1/tasks");
    expect(screen.getByTestId("where")).not.toHaveTextContent("task=");
  });

  it("stands Shurik as he is in the chat, with no pose of its own", () => {
    renderList([comment()]);

    const figure = screen.getByTestId("shurik-bubble").querySelector("img")!;
    expect(figure.getAttribute("src")).toBe("/shurik/avatar.png");
    expect(figure).not.toHaveClass("animate-shurik-pop");
  });

  it("says the first line once when there is no text under it", () => {
    renderList([comment({ body: " " })]);

    expect(screen.queryByTestId("shurik-message-title")).not.toBeInTheDocument();
    expect(screen.getByTestId("shurik-bubble")).toHaveTextContent("Комментарий · Ленина 42");
  });

  it("keeps a money message to its text alone", () => {
    renderList([message()]);

    expect(screen.queryByTestId("shurik-message-title")).not.toBeInTheDocument();
    expect(screen.getByTestId("shurik-bubble")).not.toHaveTextContent("Не прошло списание за подписку");
  });
});

describe("formatShurikMessageTime", () => {
  const now = new Date(2026, 9, 9, 15, 0, 0);

  it("gives the time for today, a word for yesterday and a date for anything older", () => {
    expect(formatShurikMessageTime(new Date(2026, 9, 9, 9, 12).toISOString(), now, "ru", "вчера")).toBe("09:12");
    expect(formatShurikMessageTime(new Date(2026, 9, 8, 23, 59).toISOString(), now, "ru", "вчера")).toBe("вчера");
    expect(formatShurikMessageTime(new Date(2026, 9, 2, 9, 12).toISOString(), now, "ru", "вчера")).toMatch(/^2 окт/);
  });

  it("returns nothing for a date it cannot read", () => {
    expect(formatShurikMessageTime("not a date", now, "ru", "вчера")).toBe("");
  });
});

describe("ShurikPanelTabs", () => {
  it("offers Chat and Notifications and puts the unread number on the second", () => {
    const onTabChange = vi.fn();
    render(<ShurikPanelTabs tab="chat" onTabChange={onTabChange} unreadCount={2} />);

    const chat = screen.getByRole("tab", { name: "Chat" });
    const notifications = screen.getByRole("tab", { name: /Notifications/ });
    expect(chat).toHaveAttribute("aria-selected", "true");
    expect(notifications).toHaveAttribute("aria-selected", "false");
    expect(notifications).toHaveTextContent("2");
    expect(chat).not.toHaveTextContent("2");

    fireEvent.click(notifications);
    expect(onTabChange).toHaveBeenCalledWith("notifications");
  });

  it("follows the tabs pattern: one tab stop, arrows move between the two, each names its panel", () => {
    const onTabChange = vi.fn();
    const { rerender } = render(<ShurikPanelTabs tab="chat" onTabChange={onTabChange} unreadCount={0} />);
    const chat = screen.getByRole("tab", { name: "Chat" });
    const notifications = screen.getByRole("tab", { name: "Notifications" });

    expect(chat).toHaveAttribute("tabindex", "0");
    expect(notifications).toHaveAttribute("tabindex", "-1");
    expect(chat).toHaveAttribute("aria-controls", SHURIK_PANEL_TAB_IDS.chat.panel);
    expect(notifications).toHaveAttribute("aria-controls", SHURIK_PANEL_TAB_IDS.notifications.panel);
    expect(chat).toHaveAttribute("id", SHURIK_PANEL_TAB_IDS.chat.tab);

    chat.focus();
    fireEvent.keyDown(chat, { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenLastCalledWith("notifications");
    expect(notifications).toHaveFocus();

    rerender(<ShurikPanelTabs tab="notifications" onTabChange={onTabChange} unreadCount={0} />);
    expect(notifications).toHaveAttribute("tabindex", "0");
    expect(chat).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(notifications, { key: "ArrowLeft" });
    expect(onTabChange).toHaveBeenLastCalledWith("chat");
    expect(chat).toHaveFocus();
  });

  it("shows no number when everything is read", () => {
    render(<ShurikPanelTabs tab="notifications" onTabChange={vi.fn()} unreadCount={0} />);

    expect(screen.queryByTestId("shurik-unread-badge")).not.toBeInTheDocument();
  });
});

describe("ShurikUnreadBadge", () => {
  it("renders nothing for zero and caps a long number", () => {
    const { rerender } = render(<ShurikUnreadBadge count={0} />);
    expect(screen.queryByTestId("shurik-unread-badge")).not.toBeInTheDocument();

    rerender(<ShurikUnreadBadge count={3} />);
    expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("3");
    expect(screen.getByTestId("shurik-unread-badge")).toHaveAccessibleName("3 unread notifications");

    rerender(<ShurikUnreadBadge count={250} />);
    expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("99+");
  });
});
