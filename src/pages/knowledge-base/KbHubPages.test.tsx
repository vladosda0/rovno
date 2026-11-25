import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeKbRow } from "@/lib/knowledge-base/kbConfig.mjs";

const fetchKbFolderCounts = vi.fn();
const fetchKbDocumentPage = vi.fn();

const fetchKbSolutions = vi.fn().mockResolvedValue([]);
const fetchKbSolutionBySlug = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbSolutions: () => fetchKbSolutions(),
  fetchKbSolutionBySlug: (slug: string) => fetchKbSolutionBySlug(slug),
  fetchKbFolderCounts: () => fetchKbFolderCounts(),
  fetchKbDocumentPage: (p: unknown) => fetchKbDocumentPage(p),
  fetchKbSpFullTextEnabled: () => Promise.resolve(true),
  fetchKbDocumentBySlug: vi.fn(),
  fetchKbClauses: vi.fn(),
  fetchKbDocumentById: vi.fn(),
}));

vi.mock("@/components/blog/BlogShell", () => ({
  BlogShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

import { KbFolderPage, KbIndexPage } from "@/pages/knowledge-base/KbHubPages";

const SP71 = normalizeKbRow({
  doc_id: "SP-012", slug: "sp-71-13330", designation: "СП 71.13330", title: "Изоляционные и отделочные покрытия",
  category: "Свод правил", folder: "sp", display_mode: "full_text", full_text_available: true,
  text_label: "checking", text_base_year: 2017, pending_amendments: [{ no: 1, url: null }],
});

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/baza" element={<KbIndexPage />} />
          <Route path="/baza/razdel/:folder" element={<KbFolderPage />} />
          <Route path="/baza/razdel/:folder/:page" element={<KbFolderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchKbFolderCounts.mockReset().mockResolvedValue({ sp: 237, gost: 609, cis: 0 });
  fetchKbDocumentPage.mockReset().mockResolvedValue({ rows: [SP71], total: 1200 });
  document.head.querySelectorAll("[data-rv-seo], #rv-jsonld").forEach((n) => n.remove());
});

describe("public knowledge-base hubs", () => {
  it("lists every non-empty folder as a link, with markup and a canonical", async () => {
    renderAt("/baza/");
    const sp = await screen.findByRole("link", { name: "Codes of practice (SP)" });
    expect(sp).toHaveAttribute("href", "/baza/razdel/sp/");
    expect(screen.queryByRole("link", { name: "CIS standards" })).not.toBeInTheDocument();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://rovno.ai/baza/");
    expect(document.getElementById("rv-jsonld")?.textContent).toContain("CollectionPage");
    const crumbs = screen.getByRole("navigation", { name: "Навигация по разделам" });
    expect(crumbs).toHaveTextContent("Главная");
  });

  it("lists a folder page's documents as links with the label, and pages through", async () => {
    renderAt("/baza/razdel/sp/2/");
    const link = await screen.findByRole("link", { name: "СП 71.13330 Изоляционные и отделочные покрытия" });
    expect(link).toHaveAttribute("href", "/baza/sp-71-13330/");
    expect(screen.getByText("Being checked")).toBeInTheDocument();
    expect(fetchKbDocumentPage).toHaveBeenCalledWith({ folder: "sp", search: "", page: 1, pageSize: 500 });
    expect(screen.getByRole("link", { name: "3" })).toHaveAttribute("href", "/baza/razdel/sp/3/");
    expect(screen.getByText("2", { selector: "[aria-current]" })).toBeInTheDocument();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://rovno.ai/baza/razdel/sp/2/");
    expect(screen.getByRole("link", { name: "Knowledge base" })).toHaveAttribute("href", "/baza/");
  });

  it("does not index an unknown folder", async () => {
    renderAt("/baza/razdel/nope/");
    expect(await screen.findByRole("heading", { name: "Document not found" })).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, follow");
    expect(fetchKbDocumentPage).not.toHaveBeenCalled();
  });
});
