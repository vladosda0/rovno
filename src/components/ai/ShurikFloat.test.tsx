import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHURIK_IDLE_WINK_PAUSE_MS, SHURIK_WINK_MS } from "@/components/ai/Shurik";
import { SHURIK_PEEK_MS, ShurikFloat } from "@/components/ai/ShurikFloat";
import i18n from "@/i18n";
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

function briefing(id: string, projectId: string, title: string, partial: Partial<ShurikMessage> = {}): ShurikMessage {
  return message({ id, project_id: projectId, type: "briefing", title, body: "Сегодня срок: приёмка плитки.", ...partial });
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
  it("shows the first line and the start of the text for a message about what a person did", () => {
    render(
      <ShurikFloat
        messages={[
          message({
            id: "people-1",
            project_id: "p1",
            type: "people_comment",
            title: "Комментарий · Ленина 42",
            body: "Иван Петров написал(а) в задаче «Штукатурка стен»: «Плитку привезут в четверг, не в среду.»",
          }),
        ]}
        onOpen={vi.fn()}
      />,
    );

    const peek = screen.getByTestId("shurik-peek");
    expect(peek).toHaveTextContent("Комментарий · Ленина 42");
    expect(peek).toHaveTextContent("Иван Петров написал(а) в задаче «Штукатурка стен»");
    expect(figure().getAttribute("src")).toBe("/shurik/avatar.png");

    act(() => {
      vi.advanceTimersByTime(SHURIK_PEEK_MS);
    });
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("1");
  });

  it("shows the first line alone for a message about a person that has no text", () => {
    render(
      <ShurikFloat
        messages={[message({ id: "people-2", type: "people_assignment", title: "Назначение · Ленина 42", body: null })]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Назначение · Ленина 42");
  });

  describe("report reminders", () => {
    const reminder = (id: string, projectId: string, title: string) =>
      message({ id, project_id: projectId, type: "client_report_reminder", title, body: "За неделю закрыто 4 задачи." });

    it("shows a single reminder by its own first line", () => {
      render(<ShurikFloat messages={[reminder("r-1", "p1", "Отчёт клиенту · Ленина 42")]} onOpen={vi.fn()} />);

      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Отчёт клиенту · Ленина 42");
      expect(figure().getAttribute("src")).toBe("/shurik/avatar.png");
    });

    it("shows one line for several projects, counting projects and reminders only", () => {
      render(
        <ShurikFloat
          messages={[
            reminder("r-3", "p3", "Отчёт клиенту · Офис на Мира"),
            reminder("r-2", "p2", "Отчёт клиенту · Дача, баня"),
            reminder("r-1", "p1", "Отчёт клиенту · Ленина 42"),
            briefing("b-1", "p4", "Планёрка · Склад"),
          ]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.getAllByTestId("shurik-peek")).toHaveLength(1);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Client report · 3 projects");
      expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("4");
    });

    it("says the number of projects in Russian the way it is spoken", () => {
      const line = (count: number) => i18n.t("ai.notifications.clientReportBatch", { count, lng: "ru" });
      expect(line(2)).toBe("Отчёт клиенту · 2 проекта");
      expect(line(3)).toBe("Отчёт клиенту · 3 проекта");
      expect(line(5)).toBe("Отчёт клиенту · 5 проектов");
      expect(line(21)).toBe("Отчёт клиенту · 21 проект");
    });
  });

  describe("briefings", () => {
    const lenina = briefing("b-1", "p1", "Планёрка · Ленина 42");
    const dacha = briefing("b-2", "p2", "Планёрка · Дача, баня");
    const office = briefing("b-3", "p3", "Планёрка · Офис на Мира");

    it("shows one line for a batch of them, for 8 seconds, with every message counted on Shurik", () => {
      render(<ShurikFloat messages={[office, dacha, lenina]} onOpen={vi.fn()} />);

      expect(screen.getAllByTestId("shurik-peek")).toHaveLength(1);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Briefing · 3 projects");
      expect(screen.getByTestId("shurik-peek")).not.toHaveTextContent("Офис на Мира");
      expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("3");

      act(() => {
        vi.advanceTimersByTime(SHURIK_PEEK_MS - 1);
      });
      expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
      expect(screen.getByTestId("shurik-unread-badge")).toHaveTextContent("3");
    });

    it("counts the whole batch as shown: none of them comes up on the next visit", () => {
      const first = render(<ShurikFloat messages={[dacha, lenina]} onOpen={vi.fn()} />);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Briefing · 2 projects");
      first.unmount();

      const second = render(<ShurikFloat messages={[dacha, lenina]} onOpen={vi.fn()} />);
      expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
      second.unmount();

      render(<ShurikFloat messages={[lenina]} onOpen={vi.fn()} />);
      expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    });

    it("shows a single briefing by its own first line", () => {
      render(<ShurikFloat messages={[lenina]} onOpen={vi.fn()} />);

      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Планёрка · Ленина 42");
      expect(figure().getAttribute("src")).toBe("/shurik/avatar.png");
    });

    it("counts projects, not messages: two days of one project are not two projects", () => {
      const yesterday = briefing("b-0", "p1", "Планёрка · Ленина 42", { created_at: "2026-10-08T06:00:00.000Z" });
      const { unmount } = render(<ShurikFloat messages={[lenina, yesterday]} onOpen={vi.fn()} />);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Планёрка · Ленина 42");
      unmount();
      localStorage.clear();

      render(<ShurikFloat messages={[dacha, lenina, yesterday]} onOpen={vi.fn()} />);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Briefing · 2 projects");
    });

    it("leaves out briefings already read or already shown", () => {
      const first = render(<ShurikFloat messages={[lenina]} onOpen={vi.fn()} />);
      first.unmount();

      render(
        <ShurikFloat
          messages={[office, { ...dacha, is_read: true, read_at: "2026-10-09T07:00:00.000Z" }, lenina]}
          onOpen={vi.fn()}
        />,
      );
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Планёрка · Офис на Мира");
    });

    it("gives the line to a newer message of another kind, as before", () => {
      const money = message({ id: "msg-9", created_at: "2026-10-09T08:00:00.000Z" });
      render(<ShurikFloat messages={[money, dacha, lenina]} onOpen={vi.fn()} />);

      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Не прошло списание за подписку");
      expect(screen.getByTestId("shurik-peek")).not.toHaveTextContent("Briefing");
    });

    it("counts briefings only: an older unread message of another project does not make a batch", () => {
      const older = message({ id: "msg-0", project_id: "p9", type: "deadline_soon", created_at: "2026-10-08T06:00:00.000Z" });
      const { unmount } = render(<ShurikFloat messages={[lenina, older]} onOpen={vi.fn()} />);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Планёрка · Ленина 42");
      expect(screen.getByTestId("shurik-peek")).not.toHaveTextContent("Briefing");
      unmount();
      localStorage.clear();

      render(<ShurikFloat messages={[dacha, lenina, older]} onOpen={vi.fn()} />);
      expect(screen.getByTestId("shurik-peek")).toHaveTextContent("Briefing · 2 projects");
    });

    it("takes the batch line away once the briefings are read", () => {
      const { rerender } = render(<ShurikFloat messages={[dacha, lenina]} onOpen={vi.fn()} />);
      expect(screen.getByTestId("shurik-peek")).toBeInTheDocument();

      const read = { is_read: true, read_at: "2026-10-09T07:00:00.000Z" };
      rerender(<ShurikFloat messages={[{ ...dacha, ...read }, { ...lenina, ...read }]} onOpen={vi.fn()} />);
      expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
    });

    it("says the number of projects in Russian the way it is spoken", () => {
      const line = (count: number) => i18n.t("ai.notifications.briefingBatch", { count, lng: "ru" });

      expect(line(2)).toBe("Планёрка · 2 проекта");
      expect(line(4)).toBe("Планёрка · 4 проекта");
      expect(line(5)).toBe("Планёрка · 5 проектов");
      expect(line(11)).toBe("Планёрка · 11 проектов");
      expect(line(21)).toBe("Планёрка · 21 проект");
      expect(line(22)).toBe("Планёрка · 22 проекта");
    });
  });
});
