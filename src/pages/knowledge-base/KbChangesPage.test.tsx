import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchKbChangesFeed = vi.fn();
vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbChangesFeed: () => fetchKbChangesFeed(),
}));
vi.mock("@/components/blog/BlogShell", () => ({
  BlogShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { KbChangesPublicPage } from "@/pages/knowledge-base/KbChangesPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/baza/izmeneniya/"]}>
        <Routes>
          <Route path="/baza/izmeneniya" element={<KbChangesPublicPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchKbChangesFeed.mockReset().mockResolvedValue([]);
  document.title = "";
});

describe("KbChangesPublicPage (/baza/izmeneniya/, slice 8, frame 5)", () => {
  it("shows the same lines as the app, with crumbs and links to the public pages", async () => {
    fetchKbChangesFeed.mockResolvedValue([
      { listed_on: "2026-11-10", event: "amendment_approved", doc_slug: "sp-29-13330", doc_heading: "СП 29.13330 · Полы", amendment_no: 5, effective_from: "2027-06-01" },
      { listed_on: "2026-10-22", event: "solution_rechecked", solution_slug: "poly", solution_title: "Полы в санузле", after_doc_slug: "sp-29-13330", after_doc_heading: "СП 29.13330", after_amendment_no: 4 },
    ]);
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "What changed in the knowledge base" })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Навигация по разделам" });
    expect(within(crumbs).getByRole("link", { name: "Knowledge base" })).toHaveAttribute("href", "/baza/");
    expect(crumbs).toHaveTextContent("What changed");
    expect(await screen.findByRole("heading", { level: 2, name: "November 2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "СП 29.13330 · Полы" })).toHaveAttribute("href", "/baza/sp-29-13330/");
    expect(screen.getByRole("link", { name: "Solution «Полы в санузле»" })).toHaveAttribute("href", "/baza/resheniya/poly/");
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute("href")).toBe("https://rovno.ai/baza/izmeneniya/");
  });

  it("says nothing has changed yet", async () => {
    renderPage();
    expect(await screen.findByText("Nothing has changed yet. The next check is on Monday.")).toBeInTheDocument();
  });
});
