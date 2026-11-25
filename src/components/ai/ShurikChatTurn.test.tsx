import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShurikAnswerActions, ShurikAnswerTurn, ShurikUserTurn } from "@/components/ai/ShurikChatTurn";

const noop = () => {};

describe("ShurikChatTurn", () => {
  it("draws the person's message blue", () => {
    render(<ShurikUserTurn content="Какой уклон?" />);
    expect(screen.getByText("Какой уклон?")).toHaveClass("bg-accent", "text-accent-foreground");
  });

  it("draws a saved message marked as learning as an ordinary answer", () => {
    render(
      <ShurikAnswerTurn message={{ id: "1", role: "assistant", content: "Ответ", timestamp: "2026-11-02T00:00:00Z", mode: "learn" }} />,
    );
    expect(screen.getByTestId("shurik-bubble")).toHaveTextContent("Ответ");
    expect(screen.queryByText("Обучение")).not.toBeInTheDocument();
    expect(screen.queryByText("Learn")).not.toBeInTheDocument();
  });

  it("lights the pressed rating and reports the press", () => {
    const onRate = vi.fn();
    render(
      <ShurikAnswerActions rating="bad" onCopy={noop} onRate={onRate} onSave={noop} onRegenerate={noop} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons[2]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(buttons[1]);
    expect(onRate).toHaveBeenCalledWith("good");
  });
});
