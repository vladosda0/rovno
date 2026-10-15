import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { ShurikHintCard } from "@/components/ai/ShurikHintCard";
import type { ShurikHintOfDay } from "@/lib/shurik-hints";

vi.mock("@/data/messenger-links", () => ({ TELEGRAM_BOT_USERNAME: "rovno_test_bot" }));

function hint(partial: Partial<ShurikHintOfDay> = {}): ShurikHintOfDay {
  return {
    day: "2026-10-15",
    hint_key: "T20",
    level: 2,
    params: { task_id: "t-1", task_title: "Plastering in the study" },
    status: "active",
    ...partial,
  };
}

function renderCard(value: ShurikHintOfDay) {
  const handlers = { onNavigate: vi.fn(), onAsk: vi.fn(), onDismiss: vi.fn() };
  render(<ShurikHintCard hint={value} projectId="p1" {...handlers} />);
  return handlers;
}

describe("ShurikHintCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws the server's hint with the names from params and one button to the place", () => {
    const { onNavigate } = renderCard(hint());
    const card = screen.getByTestId("shurik-hint-card");
    expect(card).toHaveTextContent("Shurik");
    expect(card).toHaveTextContent("The task “Plastering in the study” has no deadline.");
    expect(screen.getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Set deadline" }));
    expect(onNavigate).toHaveBeenCalledWith("/project/p1/tasks?task=t-1");
  });

  it("opens the bot in Telegram in a new tab instead of moving the app", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { onNavigate } = renderCard(hint({ hint_key: "K07", level: 4, params: {} }));

    fireEvent.click(screen.getByRole("button", { name: "Open Telegram" }));
    expect(open).toHaveBeenCalledWith("https://t.me/rovno_test_bot", "_blank", "noopener,noreferrer");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("closes until tomorrow with the cross", () => {
    const { onDismiss, onNavigate } = renderCard(hint());
    fireEvent.click(screen.getByRole("button", { name: "Close until tomorrow" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("shows «Done. Keep it up!» instead of the button once the reason is gone", () => {
    renderCard(hint({ status: "done" }));
    expect(screen.getByTestId("shurik-hint-done")).toHaveTextContent("Done. Keep it up!");
    expect(screen.queryByRole("button", { name: "Set deadline" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close until tomorrow" })).toBeInTheDocument();
  });

  it("names the day an item is needed by as a date", () => {
    renderCard(hint({ hint_key: "T32", params: { item_id: "i-1", item_title: "Bathroom tiles", order_by: "2026-10-21" } }));
    expect(screen.getByTestId("shurik-hint-card")).toHaveTextContent("“Bathroom tiles” is needed by October 21");
  });

  it("draws nothing for a hint this app has no address for", () => {
    renderCard(hint({ hint_key: "T05" }));
    expect(screen.queryByTestId("shurik-hint-card")).not.toBeInTheDocument();
  });

  it("draws nothing, never a raw key, when the app has an address but no words for the hint", () => {
    for (const missing of ["shurikHints.T20.text", "shurikHints.T20.button"]) {
      const exists = i18n.exists.bind(i18n);
      vi.spyOn(i18n, "exists").mockImplementation((key, options) => key !== missing && exists(key, options));
      const view = render(<ShurikHintCard hint={hint()} projectId="p1" onNavigate={vi.fn()} onAsk={vi.fn()} onDismiss={vi.fn()} />);
      expect(screen.queryByTestId("shurik-hint-card"), missing).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("shurikHints.");
      view.unmount();
      vi.restoreAllMocks();
    }
  });
});
