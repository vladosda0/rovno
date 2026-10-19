import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHURIK_WINK_MS } from "@/components/ai/Shurik";
import { isFreshAssistantReply, SHURIK_FRESH_REPLY_MS, ShurikBubble } from "@/components/ai/ShurikBubble";
import type { AIMessage } from "@/types/ai";

const NOW = Date.parse("2026-10-06T10:00:00.000Z");

function message(overrides: Partial<AIMessage>): AIMessage {
  return { id: "m1", role: "assistant", content: "hello", timestamp: new Date(NOW).toISOString(), ...overrides };
}

describe("ShurikBubble", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts the whole figure before the bubble and keeps the content inside it", () => {
    render(<ShurikBubble>the answer</ShurikBubble>);

    const row = screen.getByTestId("shurik-bubble");
    const figure = row.querySelector("img")!;
    const bubble = screen.getByText("the answer");
    expect(figure.getAttribute("src")).toBe("/shurik/avatar.png");
    expect(figure.getAttribute("width")).toBe("64");
    expect(figure.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubble.contains(figure)).toBe(false);
  });

  it("leaves the name to the text next to the figure", () => {
    render(<ShurikBubble>the answer</ShurikBubble>);

    expect(screen.getByTestId("shurik-bubble").querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("stands still by default", () => {
    render(<ShurikBubble>the answer</ShurikBubble>);

    const figure = screen.getByTestId("shurik-bubble").querySelector("img")!;
    act(() => {
      vi.advanceTimersByTime(SHURIK_WINK_MS * 20);
    });
    expect(figure.getAttribute("src")).toBe("/shurik/avatar.png");
  });

  it("winks once when asked to and then stands still", () => {
    render(<ShurikBubble wink>the answer</ShurikBubble>);

    const figure = screen.getByTestId("shurik-bubble").querySelector("img")!;
    expect(figure.getAttribute("src")).toBe("/shurik/wink-ok.png");
    act(() => {
      vi.advanceTimersByTime(SHURIK_WINK_MS);
    });
    expect(figure.getAttribute("src")).toBe("/shurik/avatar.png");
    act(() => {
      vi.advanceTimersByTime(SHURIK_WINK_MS * 20);
    });
    expect(figure.getAttribute("src")).toBe("/shurik/avatar.png");
  });
});

describe("isFreshAssistantReply", () => {
  it("is true for an assistant reply that has just arrived", () => {
    expect(isFreshAssistantReply(message({}), NOW)).toBe(true);
    expect(isFreshAssistantReply(message({}), NOW + SHURIK_FRESH_REPLY_MS - 1)).toBe(true);
  });

  it("is false for a reply already on screen for a while or restored from history", () => {
    expect(isFreshAssistantReply(message({}), NOW + SHURIK_FRESH_REPLY_MS)).toBe(false);
    expect(isFreshAssistantReply(message({ timestamp: "2026-10-01T10:00:00.000Z" }), NOW)).toBe(false);
  });

  it("is false for the person's own message and for an unreadable timestamp", () => {
    expect(isFreshAssistantReply(message({ role: "user" }), NOW)).toBe(false);
    expect(isFreshAssistantReply(message({ timestamp: "not a date" }), NOW)).toBe(false);
  });
});
