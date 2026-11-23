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
const fetchKbArticleTarget = vi.fn().mockResolvedValue(null);

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
  fetchKbArticleTarget: (doc: unknown) => fetchKbArticleTarget(doc),
  fetchKbChangesMonthCount: () => Promise.resolve(0),
  fetchKbChangesFeed: () => Promise.resolve([]),
  fetchKbWatching: () => Promise.resolve(false),
  setKbWatch: () => Promise.resolve(true),
}));

import { KnowledgeBaseTab } from "@/components/home/KnowledgeBaseTab";
import type { RuntimeAuthState } from "@/hooks/use-runtime-auth";
import { __unsafeResetRuntimeAuthForTests, __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

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

  it("puts «Следить за изменениями» in the reading page header for a signed-in reader (slice 8, frame 4)", async () => {
    __unsafeSetRuntimeAuthStateForTests({ status: "authenticated", session: null, user: null, profileId: "p1" } as unknown as RuntimeAuthState);
    try {
      renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
      const follow = await screen.findByRole("button", { name: "Follow changes" });
      expect(follow.closest("header")).toContainElement(screen.getByRole("heading", { level: 1 }));
    } finally {
      __unsafeResetRuntimeAuthForTests();
    }
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

  it("a building code's contents button names the section, not the headed subsection (slice 9 keeps SP as it was)", async () => {
    window.location.hash = "#p-7-1-1";
    renderKB("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    await screen.findByText("Записи в журнале и в общем журнале.");
    expect(screen.getAllByText("Contents: 7 Отделочные работы").length).toBeGreaterThan(0);
    expect(screen.queryByText("Contents: 7.1 Общие требования")).not.toBeInTheDocument();
  });

  it("a law: chapter caption, article heading, part number, the edition note in grey and searchable (slice 9)", async () => {
    const law = normalizeKbRow({
      doc_id: "LAW-001", slug: "grk-rf", designation: "ГрК РФ", title: "Градостроительный кодекс РФ", category: "Закон",
      folder: "laws", display_mode: "full_text", full_text_available: true, text_label: "verified",
      edition_date: "2026-08-04", text_checked_at: "2026-11-10", text_source_url: "http://pravo.gov.ru/proxy/ips/?doc_itself=&nd=102090643&fulltext=1",
    });
    fetchKbDocumentBySlug.mockResolvedValue(law);
    fetchKbClauses.mockResolvedValue([
      { anchor: "gl-6", number: null, level: 1, heading: "Глава 6. Проектирование", body: "", position: 1 },
      { anchor: "st-51", number: null, level: 2, heading: "Статья 51. Разрешение на строительство", body: "", position: 2 },
      { anchor: "st-51-ch-1", number: "1", level: 3, heading: null, body: "Разрешение есть документ.\n(В редакции Федерального закона от 03.08.2018 № 342-ФЗ)", position: 3 },
      { anchor: "st-51-ch-17", number: "17", level: 3, heading: null, body: "Выдача разрешения не требуется в случае:\n1) строительства гаража;\n2) строительства киоска.", position: 4 },
    ].map(normalizeKbClause));
    window.location.hash = "#st-51-ch-1";
    renderKB("/home?docTab=knowledge-base&kbDoc=grk-rf");
    expect(await screen.findByText("Статья 51. Разрешение на строительство")).toBeInTheDocument();
    expect(screen.getByText("Разрешение есть документ.")).toBeInTheDocument();
    expect(screen.getByText("В редакции Федерального закона от 03.08.2018 № 342-ФЗ")).toHaveAttribute("data-kb-edition-note");
    expect(document.getElementById("st-51-ch-1")?.className).toMatch(/border-l-2/);
    // Пункты части с новой строки, как в официальном тексте (живая проверка 11.11).
    const items = screen.getByText(/Выдача разрешения не требуется в случае:/);
    expect(items.textContent).toContain("Выдача разрешения не требуется в случае:\n1) строительства гаража;\n2) строительства киоска.");
    expect(items.className).toMatch(/whitespace-pre-line/);
    expect(screen.getAllByText("Contents: Статья 51. Разрешение на строительство").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Search this document" }), { target: { value: "342-ФЗ" } });
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(document.querySelector("[data-kb-edition-note] mark")).toHaveTextContent("342-ФЗ");
    fireEvent.change(screen.getByRole("textbox", { name: "Search this document" }), { target: { value: "ФЗ)" } });
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(document.querySelector("[data-kb-edition-note] mark")).toHaveTextContent("ФЗ");
  });

  it("a SanPiN: decree, Roman section, point with a table drawn as a table with spans (step 9.3, show 9.2в frame 3)", async () => {
    const sanpin = normalizeKbRow({
      doc_id: "SAN-001", slug: "sanpin-2-1-3684-21", designation: "СанПиН 2.1.3684-21", title: "Санитарно-эпидемиологические требования", category: "СанПиН",
      folder: "sanpin", display_mode: "full_text", full_text_available: true, text_label: "checking",
      edition_date: "2022-02-14", text_checked_at: "2026-11-20", text_source_url: "http://pravo.gov.ru/proxy/ips/?doc_itself=&nd=602024221&fulltext=1",
    });
    const table = '⟦таблица⟧[["Виды показателей","Количество проб"],[{"t":"Микробиологические","r":2},"4"],["12"]]';
    fetchKbDocumentBySlug.mockResolvedValue(sanpin);
    fetchKbClauses.mockResolvedValue([
      { anchor: "gl-pre", number: null, level: 1, heading: "Постановление", body: "1. Утвердить санитарные правила.\nА.Ю.Попова", position: 1 },
      { anchor: "rz-iv", number: "IV", level: 1, heading: "IV. Требования к качеству воды", body: "", position: 2 },
      { anchor: "p-75", number: "75", level: 2, heading: null, body: `Количество проб воды устанавливается с учётом таблицы 1.\nТаблица 1\n${table}\nПробы отбираются ежемесячно.`, position: 3 },
    ].map(normalizeKbClause));
    window.location.hash = "";
    renderKB("/home?docTab=knowledge-base&kbDoc=sanpin-2-1-3684-21");
    expect(await screen.findByText("IV. Требования к качеству воды")).toBeInTheDocument();
    const cell = screen.getByText("Микробиологические");
    expect(cell.tagName).toBe("TD");
    expect(cell).toHaveAttribute("rowspan", "2");
    expect(cell.closest("[data-kb-table]")?.className).toMatch(/overflow-x-auto/);
    expect(document.getElementById("p-75")?.textContent).not.toContain("⟦таблица⟧");
    expect(screen.getByText("Пробы отбираются ежемесячно.")).toBeInTheDocument();
    // Search finds the text after the table and highlights it; a word only inside the table is not counted.
    fireEvent.change(screen.getByRole("textbox", { name: "Search this document" }), { target: { value: "ежемесячно" } });
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(document.querySelector("#p-75 mark")).toHaveTextContent("ежемесячно");
    fireEvent.change(screen.getByRole("textbox", { name: "Search this document" }), { target: { value: "Микробиологические" } });
    expect(screen.queryByText("1 of 1")).not.toBeInTheDocument();
    expect(document.querySelector("#p-75 mark")).toBeNull();  });

  it("a law's signature with a table: the table sits in the signature, not inside a paragraph", async () => {
    const law = normalizeKbRow({
      doc_id: "LAW-006", slug: "123-fz", designation: "123-ФЗ", title: "Технический регламент", category: "Закон",
      folder: "laws", display_mode: "full_text", full_text_available: true, text_label: "verified",
      edition_date: "2025-01-01", text_checked_at: "2026-11-20", text_source_url: "http://pravo.gov.ru/proxy/ips/?doc_itself=&nd=1&fulltext=1",
    });
    fetchKbDocumentBySlug.mockResolvedValue(law);
    fetchKbClauses.mockResolvedValue([
      { anchor: "st-1", number: null, level: 2, heading: "Статья 1. Понятия", body: "", position: 1 },
      { anchor: "st-1-ch-1", number: "1", level: 3, heading: null, body: "Понятие.", position: 2 },
      { anchor: "gl-sig", number: null, level: 1, heading: null, body: 'Президент\n⟦таблица⟧[["Класс","12"]]\nМосква', position: 3 },
    ].map(normalizeKbClause));
    window.location.hash = "";
    renderKB("/home?docTab=knowledge-base&kbDoc=123-fz");
    expect(await screen.findByText("Статья 1. Понятия")).toBeInTheDocument();
    const cell = document.querySelector("[data-kb-law-signature] [data-kb-table] td");
    expect(cell).toHaveTextContent("Класс");
    expect(cell?.closest("p")).toBeNull();
    expect(screen.getByText("Москва")).toBeInTheDocument();
  });

  it("a law's preamble, ГК paragraph, КоАП notes and signature (show 9.2в, frames 1-3)", async () => {
    const law = normalizeKbRow({
      doc_id: "LAW-019", slug: "koap-rf", designation: "КоАП РФ", title: "КоАП РФ", category: "Закон",
      folder: "laws", display_mode: "full_text", full_text_available: true, text_label: "verified",
      edition_date: "2026-08-04", text_checked_at: "2026-11-17", text_source_url: "http://pravo.gov.ru/proxy/ips/?doc_itself=&nd=102074277&fulltext=1",
    });
    fetchKbDocumentBySlug.mockResolvedValue(law);
    fetchKbClauses.mockResolvedValue([
      { anchor: "gl-pre", number: null, level: 1, heading: "Преамбула", body: "Настоящий Кодекс принимается в целях защиты.", position: 1 },
      { anchor: "rz-iv-pz-2", number: null, level: 1, heading: "Подраздел 2. Отдельные виды обязательств", body: "", position: 2 },
      { anchor: "gl-37", number: null, level: 1, heading: "Глава 37. Подряд", body: "", position: 2 },
      { anchor: "gl-37-pg-3", number: null, level: 1, heading: "§ 3. Строительный подряд", body: "", position: 3 },
      { anchor: "st-2-4", number: null, level: 2, heading: "Статья 2.4. Ответственность должностных лиц", body: "Подлежит должностное лицо.", position: 4 },
      { anchor: "st-2-4-pr", number: "пр.", level: 3, heading: null, body: "Под должностным лицом следует понимать лицо.", position: 5 },
      { anchor: "st-4-8", number: null, level: 2, heading: "Статья 4.8. Исчисление сроков", body: "", position: 6 },
      { anchor: "st-4-8-ch-1", number: "1", level: 3, heading: null, body: "Сроки исчисляются часами.", position: 7 },
      { anchor: "st-4-8-pr-1", number: "пр. 1", level: 3, heading: null, body: "Положения не применяются.", position: 8 },
      { anchor: "st-4-8-pr-2", number: "пр. 2", level: 3, heading: null, body: "Положения частей не применяются.", position: 9 },
      { anchor: "st-9", number: null, level: 2, heading: "Статья 9. Индекс", body: "", position: 9 },
      { anchor: "st-9-pr-1-1", number: "пр. 1¹", level: 3, heading: null, body: "Первое примечание с индексом.", position: 9 },
      { anchor: "gl-sig", number: null, level: 1, heading: null, body: "Президент Российской Федерации В.Путин\nМосква, Кремль", position: 10 },
    ].map(normalizeKbClause));
    window.location.hash = "#st-2-4-pr";
    renderKB("/home?docTab=knowledge-base&kbDoc=koap-rf");
    expect(await screen.findByText("Статья 2.4. Ответственность должностных лиц")).toBeInTheDocument();
    // Preamble: paragraphs with no heading in the text; «Преамбула» only in the contents.
    expect(document.querySelector("[data-kb-law-preamble]")).toHaveTextContent("Настоящий Кодекс принимается в целях защиты.");
    expect(document.getElementById("gl-pre")?.querySelector("h2")).toBeNull();
    // Paragraph: a heading between the chapter caption and the article, not muted like the chapter.
    const pg = screen.getByText("§ 3. Строительный подряд");
    expect(pg.className).toMatch(/text-body\b/);
    expect(pg.className).not.toMatch(/text-muted-foreground/);
    // «Подраздел» sits above the chapter: a quiet caption like the section and the chapter.
    expect(screen.getByText("Подраздел 2. Отдельные виды обязательств").className).toMatch(/text-muted-foreground/);
    // Notes: the caption the law writes over the first note, numbers «пр.», «пр. 1» that copy the link.
    const captions = [...document.querySelectorAll("[data-kb-law-note-caption]")].map((n) => n.textContent);
    expect(captions).toEqual(["Note.", "Notes:", "Notes:"]);
    expect(screen.getByRole("button", { name: "пр. Copy link to this clause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "пр. 2. Copy link to this clause" })).toBeInTheDocument();
    expect(document.getElementById("st-2-4-pr")?.className).toMatch(/border-l-2/);
    // Signature: muted, after the last article.
    expect(document.querySelector("[data-kb-law-signature]")).toHaveTextContent("Москва, Кремль");
    expect(document.querySelector("[data-kb-law-signature]")?.className).toMatch(/text-muted-foreground/);
  });

  it("a link to the law's signature lands on it with the left marker, the top rule stays neutral", async () => {
    const law = normalizeKbRow({
      doc_id: "LAW-102", slug: "7-fz", designation: "7-ФЗ", title: "Об охране окружающей среды", category: "Закон",
      folder: "laws", display_mode: "full_text", full_text_available: true, text_label: "verified",
      edition_date: "2026-08-04", text_checked_at: "2026-11-17", text_source_url: "http://pravo.gov.ru/proxy/ips/?doc_itself=&nd=1&fulltext=1",
    });
    fetchKbDocumentBySlug.mockResolvedValue(law);
    fetchKbClauses.mockResolvedValue([
      { anchor: "st-1", number: null, level: 2, heading: "Статья 1. Понятия", body: "Текст.", position: 1 },
      { anchor: "st-2", number: null, level: 2, heading: "Статья 2. Предмет", body: "Текст.", position: 2 },
      { anchor: "gl-sig", number: null, level: 1, heading: null, body: "Москва, Кремль", position: 3 },
    ].map(normalizeKbClause));
    window.location.hash = "#gl-sig";
    renderKB("/home?docTab=knowledge-base&kbDoc=7-fz");
    expect(await screen.findByText("Статья 1. Понятия")).toBeInTheDocument();
    const sig = document.querySelector("[data-kb-law-signature]")!;
    expect(sig.className).toMatch(/scroll-mt-20/);
    expect(sig.className).toMatch(/border-l-2 border-l-accent/);
    expect(sig.className).toMatch(/border-border/);
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

describe("a document without an official text (slice 9, frame 5)", () => {
  const VSN = normalizeKbRow({
    doc_id: "NORM-0002",
    slug: "vsn-57-88-r",
    designation: "ВСН 57-88(р)",
    title: "Положение по техническому обследованию жилых зданий",
    category: "Ведомственные нормы",
    folder: "snip",
    display_mode: "full_text",
    source_links: [],
    full_text_available: false,
    text_unavailable_reason:
      "Официального текста в открытом доступе нет: документ не опубликован на портале правовой информации и на сайте ведомства.",
  });
  const VSN_COPY_ROW = {
    ...{
      doc_id: "NORM-0002",
      slug: "vsn-57-88-r",
      designation: "ВСН 57-88(р)",
      title: "Положение по техническому обследованию жилых зданий",
      category: "Ведомственные нормы",
      folder: "snip",
      display_mode: "full_text",
      source_links: [],
    },
    full_text_available: true,
    text_label: "copy",
    edition_date: "1988-07-06",
    text_checked_at: "2026-11-13",
    text_source_url: "https://meganorm.ru/Data2/1/4294854/4294854948.htm",
  };
  const VSN_COPY = normalizeKbRow(VSN_COPY_ROW);

  it("the window says the reason instead of «later» (A)", async () => {
    fetchKbFolderCounts.mockResolvedValue({ snip: 1 });
    fetchKbDocumentPage.mockResolvedValue({ rows: [VSN], total: 1 });
    fetchKbDocumentBySlug.mockResolvedValue(VSN);
    renderKB("/home?docTab=knowledge-base&kbDoc=vsn-57-88-r");
    expect(await screen.findByText(/документ не опубликован на портале правовой информации/)).toBeInTheDocument();
    expect(screen.queryByText("The full text will appear in the base later.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read the full text" })).not.toBeInTheDocument();
  });

  it("a text from a copy opens with the copy notice and no label (B)", async () => {
    fetchKbFolderCounts.mockResolvedValue({ snip: 1 });
    fetchKbDocumentPage.mockResolvedValue({ rows: [VSN_COPY], total: 1 });
    fetchKbDocumentBySlug.mockResolvedValue(VSN_COPY);
    renderKB("/home?docTab=knowledge-base&kbDoc=vsn-57-88-r");
    expect(await screen.findByText(/The text is taken from a copy on meganorm\.ru/)).toBeInTheDocument();
    expect(document.querySelector("[data-kb-label]")).toBeNull();
    expect(await screen.findByText("Учет работ ведут в журнале.")).toBeInTheDocument();
  });

  it("a copy recognized from a scan does not claim an official PDF", async () => {
    const scanned = normalizeKbRow({ ...VSN_COPY_ROW, recognized_from_scan: true, text_pdf_url: "https://meganorm.ru/x.pdf" });
    fetchKbFolderCounts.mockResolvedValue({ snip: 1 });
    fetchKbDocumentPage.mockResolvedValue({ rows: [scanned], total: 1 });
    fetchKbDocumentBySlug.mockResolvedValue(scanned);
    renderKB("/home?docTab=knowledge-base&kbDoc=vsn-57-88-r");
    expect(await screen.findByText(/The text is taken from a copy on meganorm\.ru/)).toBeInTheDocument();
    expect(screen.queryByText(/official PDF/i)).not.toBeInTheDocument();
  });
});

describe("a record about one article of a code (docs-library 9.9)", () => {
  const ARTICLE = normalizeKbRow({
    doc_id: "LAW-220",
    slug: "st-220-nk-rf",
    designation: "ст. 220 НК РФ",
    title: "НК РФ, ст. 220: имущественные налоговые вычеты",
    category: "Федеральный закон",
    folder: "laws",
    display_mode: "full_text",
    source_links: [],
    full_text_available: false,
  });
  const ref = { unit: "st", code: "НК РФ", codeLabel: "НК РФ", candidates: ["st-220"] };

  it("a reading link to the record opens the code at the article", async () => {
    fetchKbDocumentBySlug.mockImplementation((slug: string) => Promise.resolve(slug === "st-220-nk-rf" ? ARTICLE : SP71));
    fetchKbArticleTarget.mockResolvedValueOnce({ kind: "open", slug: "sp-71-13330", anchor: "p-7-1-1", ref });
    renderKB("/home?docTab=knowledge-base&kbDoc=st-220-nk-rf");
    await waitFor(() => expect(fetchKbDocumentBySlug).toHaveBeenCalledWith("sp-71-13330"));
    expect(await screen.findByText("Записи в журнале и в общем журнале.")).toBeInTheDocument();
    expect(screen.queryByText("The full text will appear in the base later.")).not.toBeInTheDocument();
  });

  it("the window offers «Read in НК РФ» and opens the code there", async () => {
    fetchKbFolderCounts.mockResolvedValue({ laws: 1 });
    fetchKbDocumentPage.mockResolvedValue({ rows: [ARTICLE], total: 1 });
    fetchKbDocumentBySlug.mockResolvedValue(SP71);
    fetchKbArticleTarget.mockResolvedValue({ kind: "open", slug: "sp-71-13330", anchor: "p-7-1-1", ref });
    renderKB();
    fireEvent.click(await screen.findByText("Laws and acts"));
    fireEvent.click(await screen.findByText(/ст\. 220 НК РФ/));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Read in НК РФ" }));
    await waitFor(() => expect(fetchKbDocumentBySlug).toHaveBeenCalledWith("sp-71-13330"));
  });

  it("a record whose code has no text shows the reason line", async () => {
    fetchKbDocumentBySlug.mockResolvedValue({ ...ARTICLE, designation: "ст. 26 ЖК РФ" });
    fetchKbArticleTarget.mockResolvedValueOnce({ kind: "reason", why: "codeMissing", codeLabel: "ЖК РФ", ref });
    renderKB("/home?docTab=knowledge-base&kbDoc=st-220-nk-rf");
    expect(await screen.findByText(/This record is about a part of ЖК РФ/)).toBeInTheDocument();
    expect(screen.queryByText("The full text will appear in the base later.")).not.toBeInTheDocument();
  });
});
