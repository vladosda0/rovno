import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarOpener } from "@/components/ai/SidebarOpener";

describe("SidebarOpener", () => {
  it("fades in on mount, and not under reduced motion", () => {
    render(
      <SidebarOpener
        opener={{ lines: ["Two tasks are overdue"], chips: [], signals: ["overdue"] }}
        onSelect={vi.fn()}
      />,
    );

    const root = screen.getByText("Two tasks are overdue").parentElement!;
    expect(root).toHaveClass("animate-in", "fade-in", "duration-200", "motion-reduce:animate-none");
  });
});
