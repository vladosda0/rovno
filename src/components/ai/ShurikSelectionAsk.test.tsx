import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShurikSelectionAsk } from "@/components/ai/ShurikSelectionAsk";

function Host({ onSubmit }: { onSubmit: (quote: string, label: string | undefined, question: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref}>
        <p data-answer data-testid="answer">Уклон пола к трапу</p>
        <p data-testid="other">Чужой текст</p>
      </div>
      <p data-testid="outside">Вне контейнера</p>
      <ShurikSelectionAsk
        containerRef={ref}
        within="[data-answer]"
        labelFor={() => "СП 29.13330, п. 4.5"}
        onSubmit={onSubmit}
      />
    </>
  );
}

function selectIn(testId: string, text = "Уклон пола") {
  const node = screen.getByTestId(testId).firstChild!;
  vi.spyOn(window, "getSelection").mockReturnValue({
    isCollapsed: false,
    rangeCount: 1,
    anchorNode: node,
    focusNode: node,
    toString: () => text,
    getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 10, bottom: 20 }) }),
  } as unknown as Selection);
  fireEvent.mouseUp(screen.getByTestId(testId));
  act(() => {
    vi.runAllTimers();
  });
}

describe("ShurikSelectionAsk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens over a selection and hands back the quote, its label and the question", () => {
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} />);
    selectIn("answer");
    expect(screen.getByText("Ask Shurik about the selection")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Ask Shurik..." }), { target: { value: "А для плитки?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledWith("Уклон пола", "СП 29.13330, п. 4.5", "А для плитки?");
    expect(screen.queryByText("Ask Shurik about the selection")).not.toBeInTheDocument();
  });

  it("ignores a selection elsewhere", () => {
    render(<Host onSubmit={vi.fn()} />);
    selectIn("other");
    selectIn("outside");
    expect(screen.queryByText("Ask Shurik about the selection")).not.toBeInTheDocument();
  });

  it("closes on a press elsewhere and on Escape", () => {
    render(<Host onSubmit={vi.fn()} />);
    selectIn("answer");
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Ask Shurik about the selection")).not.toBeInTheDocument();
    selectIn("answer");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Ask Shurik about the selection")).not.toBeInTheDocument();
  });

  it("is not there on a phone", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });
    render(<Host onSubmit={vi.fn()} />);
    selectIn("answer");
    expect(screen.queryByText("Ask Shurik about the selection")).not.toBeInTheDocument();
  });
});
