// docs-library slice 2: the full text from the tile to the reading page inside
// «Документы» (mockup docs-library-s2 v2, label v2). English locale in tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeKbRow } from "@/lib/knowledge-base/kbConfig.mjs";
import { normalizeKbClause } from "@/lib/knowledge-base/kbFullText.mjs";
import type { KbDocument } from "@/lib/knowledge-base/api";

const fetchKbFolderCounts = vi.fn();
const fetchKbDocumentPage = vi.fn();
const fetchKbDocumentBySlug = vi.fn();
const fetchKbClauses = vi.fn();
const fetchKbSpFullTextEnabled = vi.fn();
const fetchKbDocumentHistory = vi.fn();

const fetchKbSolutions = vi.fn().mockResolvedValue([]);
const fetchKbSolutionBySlug = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbSolutions: () => fetchKbSolutions(),
  fetchKbSolutionBySlug: (slug: string) => fetchKbSolutionBySlug(slug),
  fetchKbFolderCounts: () => fetchKbFolderCounts(),
  fetchKbDocumentPage: (p: unknown) => fetchKbDocumentPage(p),
  fetchKbDocumentBySlug: (slug: string) => fetchKbDocumentBySlug(slug),
  fetchKbClauses: (docId: string) => fetchKbClauses(docId),
  fetchKbSpFullTextEnabled: () => fetchKbSpFullTextEnabled(),
  fetchKbDocumentById: vi.fn().mockResolvedValue(null),
  fetchKbDocumentHistory: (slug: string) => fetchKbDocumentHistory(slug),
}));

import { KnowledgeBaseTab } from "@/components/home/KnowledgeBaseTab";

const SP71: KbDocument = normalizeKbRow({
  doc_id: "SP-012",
  slug: "sp-71-13330",
  designation: "СП 71.13330",
  title: "Изоляционные и отделочные покрытия",
  category: "Свод правил",
  folder: "sp",
  display_mode: "full_text",
  edition: "СП 71.13330.2017 (ред. от 03.10.2025)",
  last_checked_at: "2026-10-13",
  source_links: [{ url: "https://minstroyrf.gov.ru/docs/14844/", kind: "official" }],
  full_text_available: true,
  text_label: "checking",
  text_base_year: 2017,
  edition_date: "2017-08-28",
  text_checked_at: "2026-10-22",
  text_source_url: "https://minstroyrf.gov.ru/docs/14844/",
  text_pdf_url: "https://minstroyrf.gov.ru/upload/iblock/a94/sp-71.pdf",
  recognized_from_scan: true,
  pending_amendments: [
    { no: 1, url: "https://minstroyrf.gov.ru/docs/17946/" },
    { no: 2, url: "https://minstroyrf.gov.ru/docs/140650/" },
    { no: 3, url: "https://minstroyrf.gov.ru/docs/419098/" },
    { no: 4, url: "https://minstroyrf.gov.ru/docs/435883/" },
  ],
});

const CLAUSES = [
  { anchor: "p-4", number: "4", level: 1, heading: "Общие положения", body: "", position: 1 },
  { anchor: "p-4-7", number: "4.7", level: 2, heading: null, body: "Учет работ ведут в журнале.", position: 2 },
  { anchor: "p-7", number: "7", level: 1, heading: "Отделочные работы", body: "", position: 3 },
  { anchor: "p-7-1", number: "7.1", level: 2, heading: "Общие требования", body: "", position: 4 },
  { anchor: "p-7-1-1", number: "7.1.1", level: 3, heading: null, body: "Записи в журнале и в общем журнале.", position: 5, amendments: [2] },
].map(normalizeKbClause);

function renderKB(entry = "/home?docTab=knowledge-base") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <KnowledgeBaseTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchKbFolderCounts.mockReset().mockResolvedValue({ sp: 1 });
  fetchKbDocumentPage.mockReset().mockResolvedValue({ rows: [SP71], total: 1 });
  fetchKbDocumentBySlug.mockReset().mockResolvedValue(SP71);
  fetchKbClauses.mockReset().mockResolvedValue(CLAUSES);
  fetchKbSpFullTextEnabled.mockReset().mockResolvedValue(true);
  fetchKbDocumentHistory.mockReset().mockResolvedValue([{ occurred_on: "2026-10-22", event: "text_checked" }]);
});

afterEach(() => {
  window.location.hash = "";
});

async function openWindow() {
  renderKB();
  fireEvent.click(await screen.findByText("Codes of practice (SP)"));
  fireEvent.click(await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия"));
  return screen.findByRole("dialog");
}

describe("knowledge base full text (slice 2)", () => {
  it("puts the yellow label on the tile instead of the check date", async () => {
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    const label = await screen.findByText("Being checked");
    expect(label).toHaveAttribute("data-kb-label", "checking");
    expect(screen.queryByText("Checked 13.10.2026")).not.toBeInTheDocument();
  });

  it("opens a document with its full text straight on the reading page (slice 7, frame 1a)", async () => {
    renderKB();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    fireEvent.click(await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия"));
    expect(await screen.findByRole("heading", { level: 1, name: "СП 71.13330 · Изоляционные и отделочные покрытия" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reading page: title with the site icon, one label, the clauses; the label opens Details and History; Back", async () => {
    renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    expect(await screen.findByRole("heading", { level: 1, name: "СП 71.13330 · Изоляционные и отделочные покрытия" })).toBeInTheDocument();
    expect(fetchKbClauses).toHaveBeenCalledWith("SP-012");
    expect(screen.getByText("Учет работ ведут в журнале.")).toBeInTheDocument();
    expect(screen.getByText("Clause amended: Amendment No. 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "official PDF" })).toHaveAttribute(
      "href",
      "https://minstroyrf.gov.ru/upload/iblock/a94/sp-71.pdf",
    );
    // The edition line and the source button left the header; the source is an icon by the title.
    expect(screen.queryByText("2017 text, without amendments No. 1-4")).not.toBeInTheDocument();
    expect(document.querySelector("[data-kb-source-icon]")).toHaveAttribute("href", "https://minstroyrf.gov.ru/docs/14844/");

    fireEvent.click(screen.getByRole("button", { name: "Being checked" }));
    const win = (await waitFor(() => {
      const el = document.querySelector("[data-kb-window]");
      if (!el) throw new Error("no window");
      return el;
    })) as HTMLElement;
    expect(within(win).getByText("Details")).toBeInTheDocument();
    expect(await within(win).findByText("22.10.2026")).toBeInTheDocument();
    expect(within(win).getByRole("link", { name: "Amendment No. 3" })).toHaveAttribute("href", "https://minstroyrf.gov.ru/docs/419098/");
    expect(screen.queryByText("Amendments not yet in the text")).not.toBeInTheDocument();
    expect(fetchKbDocumentHistory).toHaveBeenCalledWith("sp-71-13330");

    fireEvent.click(screen.getAllByRole("button", { name: /Back/ })[0]);
    expect(await screen.findByText("Codes of practice (SP)")).toBeInTheDocument();
  });

  it("searches the document: counts matches and steps between them (frame 2a)", async () => {
    renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    const input = await screen.findByRole("textbox", { name: "Search this document" });
    fireEvent.change(input, { target: { value: "журнал" } });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(document.querySelectorAll("mark")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "нет такого" } });
    expect(screen.getByText("0 of 0")).toBeInTheDocument();
  });

  it("opens a #p-… link on its clause, highlighted (frame 3)", async () => {
    window.location.hash = "#p-7-1-1";
    renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    await screen.findByText("Записи в журнале и в общем журнале.");
    expect(document.getElementById("p-7-1-1")?.className).toMatch(/border-l-2/);
    expect(document.getElementById("p-4-7")?.className).not.toMatch(/border-l-2/);
  });

  it("copies the clause link to the public page", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    fireEvent.click(await screen.findByRole("button", { name: "4.7. Copy link to this clause" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/baza\/sp-71-13330\/#p-4-7$/)));
  });

  it("with the SP switch off reads as slice 1: no label, no read button, the «later» line (R-10)", async () => {
    fetchKbSpFullTextEnabled.mockResolvedValue(false);
    const dialog = await openWindow();
    await waitFor(() => expect(within(dialog).getByText("The full text will appear in the base later.")).toBeInTheDocument());
    expect(within(dialog).queryByRole("button", { name: "Read the full text" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Status")).not.toBeInTheDocument();
    expect(screen.getAllByText("Checked 13.10.2026").length).toBeGreaterThan(0);
    expect(fetchKbClauses).not.toHaveBeenCalled();
  });

  it("with the SP switch off a reading link lands on the «later» line, not an empty reader", async () => {
    fetchKbSpFullTextEnabled.mockResolvedValue(false);
    renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    expect(await screen.findByText("The full text will appear in the base later.")).toBeInTheDocument();
    expect(fetchKbClauses).not.toHaveBeenCalled();
  });
});
