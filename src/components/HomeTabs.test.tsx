import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { markFeatureOpened } from "@/lib/new-features";
import { MemoryRouter } from "react-router-dom";
import { HomeTabs } from "@/components/HomeTabs";

function renderTabs(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HomeTabs />
    </MemoryRouter>,
  );
}

describe("HomeTabs", () => {
  it("renders all 8 home tabs", () => {
    renderTabs("/home");
    expect(screen.getByRole("link", { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Projects/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tasks/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Documents/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Procurement/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inventory/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Finance/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Resources/i })).toBeInTheDocument();
  });

  it("marks Overview as active when no tab param is present", () => {
    renderTabs("/home");
    const overview = screen.getByRole("link", { name: /Overview/i });
    expect(overview).toHaveAttribute("aria-current", "page");
    const documents = screen.getByRole("link", { name: /Documents/i });
    expect(documents).not.toHaveAttribute("aria-current", "page");
  });

  it("marks Documents as active when ?tab=documents is present", () => {
    renderTabs("/home?tab=documents");
    const documents = screen.getByRole("link", { name: /Documents/i });
    expect(documents).toHaveAttribute("aria-current", "page");
    const overview = screen.getByRole("link", { name: /Overview/i });
    expect(overview).not.toHaveAttribute("aria-current", "page");
  });

  it("falls back to Overview when ?tab=bogus", () => {
    renderTabs("/home?tab=bogus");
    expect(screen.getByRole("link", { name: /Overview/i })).toHaveAttribute("aria-current", "page");
  });
  it("puts a new-feature dot on Documents until the knowledge base is opened", () => {
    localStorage.clear();
    const { unmount } = renderTabs("/home");
    const documents = screen.getByRole("link", { name: /Documents/i });
    expect(within(documents).getByText("has something new")).toHaveClass("sr-only");
    expect(within(screen.getByRole("link", { name: /Tasks/i })).queryByText("has something new")).toBeNull();
    unmount();

    markFeatureOpened("knowledge-base");
    renderTabs("/home");
    expect(screen.queryByText("has something new")).not.toBeInTheDocument();
    localStorage.clear();
  });
});
