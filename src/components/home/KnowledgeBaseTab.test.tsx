import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { KbDocument, KbDocumentPageParams } from "@/lib/knowledge-base/api";

const fetchKbFolderCounts = vi.fn();
const fetchKbDocumentPage = vi.fn();

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbFolderCounts: () => fetchKbFolderCounts(),
  fetchKbDocumentPage: (params: KbDocumentPageParams) => fetchKbDocumentPage(params),
  fetchKbDocumentBySlug: vi.fn(),
}));

import { KnowledgeBaseTab } from "@/components/home/KnowledgeBaseTab";

function doc(overrides: Partial<KbDocument> = {}): KbDocument {
  return {
    docId: "SP-71",
    slug: "sp-71-13330",
    designation: "СП 71.13330",
    title: "Изоляционные и отделочные покрытия",
    category: "Свод правил",
    folder: "sp",
    displayMode: "full_text",
    objectTypes: ["ремонт квартир и домов", "штукатурка"],
    domains: [],
    applicabilityNote: null,
    publisher: null,
    country: null,
    edition: "2017 с изменениями 1-4",
    effectiveFrom: null,
    lastCheckedAt: "2026-10-13",
    sourceLinks: [
      { url: "https://minstroyrf.gov.ru/docs/14844/", kind: "official" },
      { url: "https://www.consultant.ru/document/cons_doc_LAW_1/", kind: "copy" },
    ],
    fullTextAvailable: false,
    ...overrides,
  };
}

const COUNTS = {
  sp: 237, gost: 609, laws: 266, snip: 57, sanpin: 26, guides: 246,
  manufacturers: 4065, international: 575, cis: 0, other: 849,
};

function renderKB() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <KnowledgeBaseTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchKbFolderCounts.mockReset().mockResolvedValue(COUNTS);
  fetchKbDocumentPage.mockReset().mockResolvedValue({ rows: [doc()], total: 1 });
});

describe("KnowledgeBaseTab", () => {
  it("shows the folder tiles in order with counts and descriptions, hiding empty folders", async () => {
    renderKB();
    expect(screen.getByRole("heading", { name: "Knowledge base" })).toBeInTheDocument();
    expect(screen.getByText(/Every document shows its edition/)).toBeInTheDocument();
    expect(await screen.findByText("237 documents")).toBeInTheDocument();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "Codes of practice (SP)", "GOST", "Laws and acts", "SNiP and departmental", "SanPiN",
      "Handbooks and manuals", "Manufacturers", "International standards", "Other",
    ]);
    expect(screen.getByText("SP of the Russian Ministry of Construction")).toBeInTheDocument();
    expect(screen.queryByText("CIS standards")).not.toBeInTheDocument();
    // No date filter: the documents have no upload date.
    expect(screen.queryByText("All time")).not.toBeInTheDocument();
    expect(fetchKbDocumentPage).not.toHaveBeenCalled();
  });

  it("enters a folder, lists its documents server-side and goes back", async () => {
    fetchKbDocumentPage.mockResolvedValue({ rows: [doc()], total: 240 });
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    expect(await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия")).toBeInTheDocument();
    expect(fetchKbDocumentPage).toHaveBeenLastCalledWith({ folder: "sp", search: "", page: 0, pageSize: 24 });
    expect(screen.getByText("2017 с изменениями 1-4")).toBeInTheDocument();
    expect(screen.getByText("Checked 13.10.2026")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(fetchKbDocumentPage).toHaveBeenLastCalledWith({ folder: "sp", search: "", page: 1, pageSize: 24 }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("GOST")).toBeInTheDocument();
  });

  it("searches every folder from the root and names the folder under each hit", async () => {
    renderKB();
    await screen.findByText("237 documents");
    fireEvent.change(screen.getByRole("textbox", { name: "Search..." }), { target: { value: "СП 71" } });
    await waitFor(() =>
      expect(fetchKbDocumentPage).toHaveBeenLastCalledWith({ folder: null, search: "СП 71", page: 0, pageSize: 24 }),
    );
    expect(await screen.findByText("Codes of practice (SP) · 2017 с изменениями 1-4")).toBeInTheDocument();
    expect(screen.queryByText("GOST")).not.toBeInTheDocument();
  });

  it("searches only inside the open folder", async () => {
    renderKB();
    fireEvent.click(await screen.findByText("GOST"));
    fireEvent.change(screen.getByRole("textbox", { name: "Search..." }), { target: { value: "гидроизоляция" } });
    await waitFor(() =>
      expect(fetchKbDocumentPage).toHaveBeenLastCalledWith({ folder: "gost", search: "гидроизоляция", page: 0, pageSize: 24 }),
    );
  });

  it("says so when the search finds nothing", async () => {
    fetchKbDocumentPage.mockResolvedValue({ rows: [], total: 0 });
    renderKB();
    await screen.findByText("237 documents");
    fireEvent.change(screen.getByRole("textbox", { name: "Search..." }), { target: { value: "zzz" } });
    expect(await screen.findByText(/Nothing found. Try the number without the year/)).toBeInTheDocument();
  });

  it("opens the document window with facts and honest source buttons, no Ask Shurik", async () => {
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    fireEvent.click(await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("СП 71.13330 · Изоляционные и отделочные покрытия")).toBeInTheDocument();
    expect(within(dialog).getByText("Свод правил")).toBeInTheDocument();
    expect(within(dialog).getByText("ремонт квартир и домов, штукатурка")).toBeInTheDocument();
    expect(within(dialog).getByText("Ministry of Construction of Russia, minstroyrf.gov.ru")).toBeInTheDocument();
    expect(within(dialog).queryByText("Topics")).not.toBeInTheDocument();
    expect(within(dialog).getByText("The full text will appear in the base later.")).toBeInTheDocument();

    const links = within(dialog).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Open on the Ministry of Construction site",
      "Open in ConsultantPlus",
    ]);
    expect(links[0]).toHaveAttribute("href", "https://minstroyrf.gov.ru/docs/14844/");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(dialog).getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("Ask Shurik")).not.toBeInTheDocument();
  });

  it("shows a document without a link with its facts and only Close", async () => {
    fetchKbDocumentPage.mockResolvedValue({
      rows: [doc({ sourceLinks: [], displayMode: "card", designation: null, title: "Еврокод 2", folder: "international" })],
      total: 1,
    });
    renderKB();
    fireEvent.click(await screen.findByText("International standards"));
    fireEvent.click(await screen.findByText("Еврокод 2"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("no link yet")).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
    expect(within(dialog).queryByText("The full text will appear in the base later.")).not.toBeInTheDocument();
  });

  it("opens the first source straight from the tile arrow", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия");
    fireEvent.click(screen.getByRole("button", { name: "Open on the Ministry of Construction site" }));
    expect(open).toHaveBeenCalledWith("https://minstroyrf.gov.ru/docs/14844/", "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    open.mockRestore();
  });

  it("never shows another folder's documents while a new folder loads", async () => {
    fetchKbDocumentPage.mockImplementation((params: KbDocumentPageParams) =>
      params.folder === "sp" ? Promise.resolve({ rows: [doc()], total: 1 }) : new Promise(() => {}),
    );
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    fireEvent.click(await screen.findByText("GOST"));
    await waitFor(() => expect(fetchKbDocumentPage).toHaveBeenLastCalledWith(expect.objectContaining({ folder: "gost" })));
    expect(screen.queryByText("СП 71.13330 Изоляционные и отделочные покрытия")).not.toBeInTheDocument();
    expect(screen.getByText("Loading tab...")).toBeInTheDocument();
  });

  it("keeps the current page visible while the next page of the same folder loads", async () => {
    let resolveNext: (v: unknown) => void = () => {};
    fetchKbDocumentPage.mockImplementation((params: KbDocumentPageParams) =>
      params.page === 0 ? Promise.resolve({ rows: [doc()], total: 240 }) : new Promise((r) => { resolveNext = r; }),
    );
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(fetchKbDocumentPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
    expect(screen.getByText("СП 71.13330 Изоляционные и отделочные покрытия")).toBeInTheDocument();
    resolveNext({ rows: [], total: 240 });
  });

  it("says the base is empty when no folder has documents", async () => {
    fetchKbFolderCounts.mockResolvedValue(Object.fromEntries(Object.keys(COUNTS).map((k) => [k, 0])));
    renderKB();
    expect(await screen.findByText("There are no documents in the base yet.")).toBeInTheDocument();
  });
});
