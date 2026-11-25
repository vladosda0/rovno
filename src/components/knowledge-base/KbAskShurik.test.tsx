import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mode } = vi.hoisted(() => ({ mode: { kind: "supabase" } }));
vi.mock("@/hooks/use-mock-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-mock-data")>();
  return { ...actual, useWorkspaceMode: () => mode };
});

import { KbAskShurikButton, KbSelectionAsk } from "@/components/knowledge-base/KbAskShurik";
import { takeShurikAsk } from "@/lib/shurik-ask";

describe("KbAskShurik", () => {
  beforeEach(() => {
    mode.kind = "supabase";
    takeShurikAsk();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the header button puts what is open into the conversation", () => {
    render(<KbAskShurikButton label="СП 29.13330" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Shurik" }));
    expect(takeShurikAsk()).toEqual({ label: "СП 29.13330" });
  });

  it("is not there where the chat is not", () => {
    mode.kind = "demo";
    render(<KbAskShurikButton label="СП" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a selection goes with its clause", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
    render(
      <KbSelectionAsk label="СП 29" within="section[id]" labelFor={() => "СП 29, п. 4.5"}>
        <section id="p-4-5" data-testid="clause">0,5 – 1 %</section>
      </KbSelectionAsk>,
    );
    const node = screen.getByTestId("clause").firstChild!;
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node,
      focusNode: node,
      toString: () => "0,5 – 1 %",
      getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 1, bottom: 1 }) }),
    } as unknown as Selection);
    fireEvent.mouseUp(screen.getByTestId("clause"));
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
    fireEvent.change(screen.getByRole("textbox", { name: "Ask Shurik..." }), { target: { value: "А плитка?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(takeShurikAsk()).toEqual({ label: "СП 29, п. 4.5", quote: "0,5 – 1 %", question: "А плитка?" });
  });
});
