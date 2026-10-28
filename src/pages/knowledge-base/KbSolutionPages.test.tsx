import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeKbSolution } from "@/lib/knowledge-base/kbSolutions.mjs";
import { SOLUTION_ROW } from "@/lib/knowledge-base/kbSolutions.fixture";

const fetchKbSolutions = vi.fn();
const fetchKbSolutionBySlug = vi.fn();

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbSolutions: () => fetchKbSolutions(),
  fetchKbSolutionBySlug: (slug: string) => fetchKbSolutionBySlug(slug),
  fetchKbFolderCounts: vi.fn(),
  fetchKbDocumentPage: vi.fn(),
  fetchKbDocumentBySlug: vi.fn(),
  fetchKbSpFullTextEnabled: () => Promise.resolve(false),
  fetchKbClauses: vi.fn(),
  fetchKbDocumentById: vi.fn(),
}));

let authStatus: "loading" | "authenticated" | "guest" = "guest";
vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => ({ status: authStatus }),
}));

vi.mock("@/components/blog/BlogShell", () => ({
  BlogShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { KbSolutionPublicPage, KbSolutionsPage } from "@/pages/knowledge-base/KbSolutionPages";

const WALLS = normalizeKbSolution(SOLUTION_ROW);

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/baza/resheniya" element={<KbSolutionsPage />} />
          <Route path="/baza/resheniya/:slug" element={<KbSolutionPublicPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authStatus = "guest";
  fetchKbSolutions.mockReset().mockResolvedValue([WALLS]);
  fetchKbSolutionBySlug.mockReset().mockResolvedValue(WALLS);
  window.sessionStorage.clear();
  document.head.querySelectorAll("[data-rv-seo], #rv-jsonld").forEach((n) => n.remove());
});

describe("public «Решения» pages", () => {
  it("lists the published cards with a canonical and markup", async () => {
    renderAt("/baza/resheniya/");
    const link = await screen.findByRole("link", { name: "Стены в санузле под плитку" });
    expect(link).toHaveAttribute("href", "/baza/resheniya/steny-v-sanuzle-pod-plitku/");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://rovno.ai/baza/resheniya/");
    expect(document.getElementById("rv-jsonld")?.textContent).toContain("CollectionPage");
  });

  it("says the list is loading on the list and the card is loading on a card", async () => {
    fetchKbSolutions.mockReturnValue(new Promise(() => {}));
    fetchKbSolutionBySlug.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderAt("/baza/resheniya/");
    expect(screen.getByText("Loading solutions…")).toBeInTheDocument();
    unmount();
    renderAt("/baza/resheniya/steny-v-sanuzle-pod-plitku/");
    expect(screen.getByText("Loading the solution…")).toBeInTheDocument();
  });

  it("has nothing to index while no card is published", async () => {
    fetchKbSolutions.mockResolvedValue([]);
    renderAt("/baza/resheniya/");
    expect(await screen.findByText("Solution not found")).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, follow");
  });

  it("shows the card to a guest with the sign-up CTA and chips leading to the guest document page, SP switch off or not", async () => {
    renderAt("/baza/resheniya/steny-v-sanuzle-pod-plitku/");
    expect(await screen.findByRole("heading", { level: 1, name: "Стены в санузле под плитку" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask Shurik" })).toHaveAttribute("href", "/auth/signup");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://rovno.ai/baza/resheniya/steny-v-sanuzle-pod-plitku/",
    );
    const crumbs = screen.getByRole("navigation", { name: "Навигация по разделам" });
    expect(within(crumbs).getByRole("link", { name: "Solutions" })).toHaveAttribute("href", "/baza/resheniya/");
    fireEvent.click(screen.getAllByRole("button", { name: "СП 163, п. 6.4.2.8" })[0]);
    expect(screen.getByRole("link", { name: "Open the clause in the document" })).toHaveAttribute(
      "href",
      "/baza/sp-163-1325800/#p-6-4-2-8",
    );
  });

  it("has no «Спросить Шурика» for a signed-in reader", async () => {
    authStatus = "authenticated";
    renderAt("/baza/resheniya/steny-v-sanuzle-pod-plitku/");
    await screen.findByRole("heading", { level: 1, name: "Стены в санузле под плитку" });
    expect(screen.queryByRole("link", { name: "Ask Shurik" })).not.toBeInTheDocument();
  });
});
