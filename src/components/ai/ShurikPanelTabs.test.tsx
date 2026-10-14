import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShurikPanelTabs } from "@/components/ai/ShurikPanelTabs";

describe("ShurikPanelTabs", () => {
  it("gives the Notifications tab no-wrap classes and a non-shrinking number next to the label", () => {
    render(<ShurikPanelTabs tab="chat" onTabChange={vi.fn()} unreadCount={2} />);
    const tab = screen.getByRole("tab", { name: /Notifications/ });
    expect(tab).toHaveClass("flex-nowrap", "whitespace-nowrap");
    const label = within(tab, "Notifications");
    expect(label).toHaveClass("truncate");
    expect(screen.getByTestId("shurik-unread-badge")).toHaveClass("shrink-0");
    expect(screen.getByTestId("shurik-unread-badge").parentElement).toBe(tab);
  });
});

function within(tab: HTMLElement, text: string): HTMLElement {
  const node = Array.from(tab.querySelectorAll("span")).find((span) => span.textContent === text);
  if (!node) throw new Error(`no label ${text}`);
  return node;
}
