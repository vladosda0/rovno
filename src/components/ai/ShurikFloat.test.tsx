import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHURIK_IDLE_WINK_PAUSE_MS, SHURIK_WINK_MS } from "@/components/ai/Shurik";
import { SHURIK_PEEK_MS, ShurikFloat } from "@/components/ai/ShurikFloat";
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
    payload: {},
    ...partial,
  };
}

function figure() {
  return screen.getByRole("button", { name: /^Open Shurik/ }).querySelector("img")!;
}

describe("ShurikFloat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the first line of a new message next to Shurik for 8 seconds, then leaves the number", () => {
    render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);

    const peek = screen.getByTestId("shurik-peek");
    expect(peek).toHaveTextContent("Shurik");
    expect(peek).toHaveTextContent("Не прошло списание за подписку");
    expect(peek).not.toHaveTextContent("Автопродление выключено");

    act(() => {
      vi.advanceTimersByTime(SHURIK_PEEK_MS - 1);
    });
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("1");
  });

  it("shows it once per message, not on every visit", () => {
    const first = render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
    first.unmount();

    // The next visit, the message still unread.
    const second = render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("1");
    second.unmount();

    render(
      <ShurikFloat
        messages={[message({ id: "msg-2", title: "Подписка отключена" }), message()]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Подписка отключена");
  });

  it("shows a message that arrives while the page is open, and restarts the 8 seconds for it", () => {
    const { rerender } = render(<ShurikFloat messages={[]} onOpen={vi.fn()} />);
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();

    rerender(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
    expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Не прошло списание за подписку");

    act(() => {
      vi.advanceTimersByTime(SHURIK_PEEK_MS - 1000);
    });
    rerender(
      <ShurikFloat messages={[message({ id: "msg-2", title: "Подписка отключена" }), message()]} onOpen={vi.fn()} />,
    );
    expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Подписка отключена");

    act(() => {
      vi.advanceTimersByTime(SHURIK_PEEK_MS - 1);
    });
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
  });

  it("does not announce what is already read", () => {
    render(<ShurikFloat messages={[message({ is_read: true, read_at: "2026-10-09T07:00:00.000Z" })]} onOpen={vi.fn()} />);

    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shurik-unread-badge")).not.toBeInTheDocument();
  });

  it("takes the first line away as soon as the message is read elsewhere", () => {
    const { rerender } = render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();

    rerender(<ShurikFloat messages={[message({ is_read: true, read_at: "2026-10-09T07:00:00.000Z" })]} onOpen={vi.fn()} />);
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
  });

  it("holds Shurik in the money pose, motionless, while a money message's first line is shown, then lets him sway again", () => {
    render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);

    expect(figure().getAttribute("src")).toBe("/shurik/salute.png");
    expect(figure().parentElement).not.toHaveClass("animate-shurik-sway");

    // Longer than the idle pause before a wink: he must not wink through it.
    act(() => {
      vi.advanceTimersByTime(SHURIK_IDLE_WINK_PAUSE_MS + SHURIK_WINK_MS / 2);
    });
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
    expect(figure().getAttribute("src")).toBe("/shurik/salute.png");
    expect(figure()).not.toHaveClass("animate-shurik-pop");

    act(() => {
      vi.advanceTimersByTime(SHURIK_PEEK_MS);
    });
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    expect(figure().getAttribute("src")).toBe("/shurik/avatar.png");
    expect(figure().parentElement).toHaveClass("animate-shurik-sway");
  });

  it("keeps Shurik swaying for a first line that is not about money", () => {
    render(<ShurikFloat messages={[message({ type: "deadline_soon" })]} onOpen={vi.fn()} />);

    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
    expect(figure().getAttribute("src")).toBe("/shurik/avatar.png");
    expect(figure().parentElement).toHaveClass("animate-shurik-sway");
  });

  it("opens the panel on Notifications from the first line and from Shurik himself", () => {
    const onOpen = vi.fn();
    render(<ShurikFloat messages={[message()]} onOpen={onOpen} />);

    fireEvent.click(screen.getByTestId("shurik-peek"));
    expect(onOpen).toHaveBeenLastCalledWith("notifications");

    fireEvent.click(screen.getByRole("button", { name: /^Open Shurik/ }));
    expect(onOpen).toHaveBeenLastCalledWith("notifications");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("opens the panel where it was left when there is nothing unread", () => {
    const onOpen = vi.fn();
    render(<ShurikFloat messages={[message({ is_read: true })]} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    expect(onOpen).toHaveBeenCalledWith(undefined);
  });

  it("waits for the browser tab to be looked at before spending the one showing", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
  });

  it("does not spend the one showing on a phone, where the hanging Shurik is not drawn", () => {
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      const phone = render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
      expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
      phone.unmount();
    } finally {
      window.innerWidth = width;
    }

    render(<ShurikFloat messages={[message()]} onOpen={vi.fn()} />);
    expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
  });
});
