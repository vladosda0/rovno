import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeKbFullTextFields } from "@/lib/knowledge-base/kbFullText.mjs";
import type { KbDocument } from "@/lib/knowledge-base/api";

const fetchKbDocumentBySlug = vi.fn();
const fetchKbClauses = vi.fn();

const fetchKbSolutions = vi.fn().mockResolvedValue([]);
const fetchKbSolutionBySlug = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbSolutions: () => fetchKbSolutions(),
  fetchKbSolutionBySlug: (slug: string) => fetchKbSolutionBySlug(slug),
  fetchKbFolderCounts: vi.fn(),
  fetchKbDocumentPage: vi.fn(),
  fetchKbDocumentBySlug: (slug: string) => fetchKbDocumentBySlug(slug),
  normalizeKbDocument: (row: unknown) => row,
  fetchKbSpFullTextEnabled: () => Promise.resolve(true),
  fetchKbClauses: (docId: string) => fetchKbClauses(docId),
  fetchKbDocumentById: vi.fn(),
  fetchKbWatching: () => Promise.resolve(false),
  setKbWatch: () => Promise.resolve(true),
}));

let authStatus: "loading" | "authenticated" | "guest" = "guest";
vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => ({ status: authStatus, profileId: authStatus === "authenticated" ? "profile-1" : null }),
}));

// The landing chrome is not under test here; keep the page shell inert.
vi.mock("@/components/blog/BlogShell", () => ({
  BlogShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
  useLandingCta: () => ({ startPath: "/auth/signup", onDemo: () => {}, authStatus: "guest" }),
}));

import KbDocumentPage from "@/pages/knowledge-base/KbDocumentPage";

const SP71: KbDocument = {
  docId: "SP-71",
  slug: "sp-71-13330",
  designation: "СП 71.13330",
  title: "Изоляционные и отделочные покрытия",
  category: "Свод правил",
  folder: "sp",
  displayMode: "full_text",
  objectTypes: [],
  domains: [],
  applicabilityNote: null,
  publisher: null,
  country: null,
  edition: "2017 с изменениями 1-4",
  effectiveFrom: null,
  lastCheckedAt: "2026-10-13",
  sourceLinks: [{ url: "https://minstroyrf.gov.ru/docs/14844/", kind: "official" }],
  fullTextAvailable: false,
  ...normalizeKbFullTextFields({}),
};

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/baza/:slug" element={<KbDocumentPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchKbDocumentBySlug.mockReset().mockResolvedValue(SP71);
  fetchKbClauses.mockReset().mockResolvedValue([]);
  document.title = "";
  authStatus = "guest";
});

describe("KbDocumentPage (/baza/:slug)", () => {
  it("shows the document with breadcrumb, facts and source buttons for a guest", async () => {
    renderAt("/baza/sp-71-13330/");
    expect(await screen.findByRole("heading", { level: 1, name: "СП 71.13330 · Изоляционные и отделочные покрытия" }))
      .toBeInTheDocument();
    expect(fetchKbDocumentBySlug).toHaveBeenCalledWith("sp-71-13330");
    const crumbs = screen.getByRole("navigation", { name: "Навигация по разделам" });
    expect(crumbs).toHaveTextContent("Knowledge base");
    expect(crumbs).toHaveTextContent("Codes of practice (SP)");
    expect(screen.getByText("Свод правил")).toBeInTheDocument();
    expect(screen.getByText("2017 с изменениями 1-4")).toBeInTheDocument();
    expect(screen.getByText("13.10.2026")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: "Open on the Ministry of Construction site" });
    expect(source).toHaveAttribute("href", "https://minstroyrf.gov.ru/docs/14844/");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(document.title).toContain("СП 71.13330");
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute("href")).toBe("https://rovno.ai/baza/sp-71-13330/");
  });

  it("shows not-found for an unknown slug", async () => {
    fetchKbDocumentBySlug.mockResolvedValue(null);
    renderAt("/baza/nope");
    expect(await screen.findByRole("heading", { name: "Document not found" })).toBeInTheDocument();
  });

  it("offers a guest «Спросить Шурика» that leads to sign-up", async () => {
    renderAt("/baza/sp-71-13330/");
    const ask = await screen.findByRole("link", { name: "Ask Shurik" });
    expect(ask).toHaveAttribute("href", "/auth/signup");
  });

  it("does not offer «Спросить Шурика» to a signed-in user", async () => {
    authStatus = "authenticated";
    renderAt("/baza/sp-71-13330/");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: "Ask Shurik" })).not.toBeInTheDocument();
  });

  it("shows a load error with retry, not not-found, when the query fails", async () => {
    fetchKbDocumentBySlug.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(SP71);
    renderAt("/baza/sp-71-13330/");
    expect(await screen.findByText("Could not load the knowledge base. Try reloading the page.")).toBeInTheDocument();
    expect(screen.queryByText("Document not found")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "СП 71.13330 · Изоляционные и отделочные покрытия" }))
      .toBeInTheDocument();
  });

  it("shows the full text under the card for a document with clauses (slice 2, frame 6)", async () => {
    fetchKbDocumentBySlug.mockResolvedValue({
      ...SP71,
      fullTextAvailable: true,
      textLabel: "checking",
      textBaseYear: 2017,
      textCheckedAt: "2026-10-22",
      editionDate: "2017-08-28",
      pendingAmendments: [{ no: 1, url: "https://minstroyrf.gov.ru/docs/17946/" }],
    });
    fetchKbClauses.mockResolvedValue([
      { anchor: "p-4-7", number: "4.7", level: 2, heading: null, body: "Учет работ ведут в журнале.", position: 1, amendments: [] },
    ]);
    renderAt("/baza/sp-71-13330/");
    expect(await screen.findByText("Учет работ ведут в журнале.")).toBeInTheDocument();
    expect(fetchKbClauses).toHaveBeenCalledWith("SP-71");
    expect(screen.getByRole("textbox", { name: "Search this document" })).toBeInTheDocument();
    expect(screen.getAllByText("Being checked").length).toBeGreaterThan(0);
    expect(screen.queryByText("The full text will appear in the base later.")).not.toBeInTheDocument();
  });

  it("does not ask for clauses of a document without a full text", async () => {
    renderAt("/baza/sp-71-13330/");
    await screen.findByRole("heading", { level: 1 });
    expect(fetchKbClauses).not.toHaveBeenCalled();
  });

  it("puts «Следить за изменениями» in the row of buttons, leading a guest to sign-up (slice 8, step 8.5)", async () => {
    renderAt("/baza/sp-71-13330/");
    const follow = await screen.findByRole("link", { name: "Follow changes" });
    expect(follow).toHaveAttribute("href", "/auth/signup?next=%2Fbaza%2Fsp-71-13330%2F");
    const row = follow.parentElement as HTMLElement;
    expect(row).toContainElement(screen.getByRole("link", { name: "Ask Shurik" }));
    expect(row).toContainElement(screen.getByRole("link", { name: "Open on the Ministry of Construction site" }));
    fireEvent.click(follow);
    expect(JSON.parse(localStorage.getItem("rovno.kbPendingWatch.v1")!).slug).toBe("sp-71-13330");
  });

  it("on a readable document stands next to «Спросить Шурика» and brings back no «Open on the site» button (frame 5a)", async () => {
    fetchKbDocumentBySlug.mockResolvedValue({ ...SP71, fullTextAvailable: true, textLabel: "verified", textCheckedAt: "2026-10-22" });
    fetchKbClauses.mockResolvedValue([
      { anchor: "p-4-7", number: "4.7", level: 2, heading: null, body: "Учет работ ведут в журнале.", position: 1, amendments: [] },
    ]);
    renderAt("/baza/sp-71-13330/");
    await screen.findByText("Учет работ ведут в журнале.");
    const follow = screen.getByRole("link", { name: "Follow changes" });
    expect(follow.parentElement).toContainElement(screen.getByRole("link", { name: "Ask Shurik" }));
    // The source is the icon at the title (slice 7), not a button in this row.
    const sources = screen.getAllByRole("link", { name: "Open on the Ministry of Construction site" });
    expect(sources).toHaveLength(1);
    expect(follow.parentElement).not.toContainElement(sources[0]);
    expect(sources[0].closest("h1, header")).not.toBeNull();
  });

  it("lets a signed-in reader follow the document right on the page", async () => {
    authStatus = "authenticated";
    renderAt("/baza/sp-71-13330/");
    expect(await screen.findByRole("button", { name: "Follow changes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Follow changes" })).not.toBeInTheDocument();
  });
});
