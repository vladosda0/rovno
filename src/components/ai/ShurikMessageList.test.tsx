import { act, fireEvent, render, screen } from "@testing-library/react";
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
  return <span data-testid="where">{location.pathname + location.search}</span>;
}

function renderList(messages: ShurikMessage[], onMarkRead = vi.fn(), onAction = vi.fn()) {
  const view = render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <ShurikMessageList messages={messages} onMarkRead={onMarkRead} onAction={onAction} />
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
