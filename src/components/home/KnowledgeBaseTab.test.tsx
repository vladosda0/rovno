import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeKbFullTextFields } from "@/lib/knowledge-base/kbFullText.mjs";
import type { KbDocument, KbDocumentPageParams } from "@/lib/knowledge-base/api";
import { normalizeKbSolution } from "@/lib/knowledge-base/kbSolutions.mjs";
import { solutionRow } from "@/lib/knowledge-base/kbSolutions.fixture";

const fetchKbFolderCounts = vi.fn();
const fetchKbDocumentPage = vi.fn();
const fetchKbDocumentBySlug = vi.fn();

const fetchKbSolutions = vi.fn().mockResolvedValue([]);
const fetchKbSolutionBySlug = vi.fn().mockResolvedValue(null);
const fetchKbChangesFeed = vi.fn().mockResolvedValue([]);
const fetchKbChangesMonthCount = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbSolutions: () => fetchKbSolutions(),
  fetchKbSolutionBySlug: (slug: string) => fetchKbSolutionBySlug(slug),
  fetchKbFolderCounts: () => fetchKbFolderCounts(),
  fetchKbDocumentPage: (params: KbDocumentPageParams) => fetchKbDocumentPage(params),
  fetchKbDocumentBySlug: (slug: string) => fetchKbDocumentBySlug(slug),
  fetchKbSpFullTextEnabled: () => Promise.resolve(true),
  fetchKbClauses: () => Promise.resolve([]),
  fetchKbDocumentById: vi.fn(),
  fetchKbChangesFeed: () => fetchKbChangesFeed(),
  fetchKbChangesMonthCount: () => fetchKbChangesMonthCount(),
  fetchKbWatching: () => Promise.resolve(false),
  setKbWatch: () => Promise.resolve(true),
}));

import { KnowledgeBaseTab } from "@/components/home/KnowledgeBaseTab";
import { kbMonthName } from "@/lib/knowledge-base/kbChanges.mjs";
import { kbMoscowToday } from "@/lib/knowledge-base/kbHistory.mjs";
import { NEW_FEATURES_STORAGE_KEY, resetNewFeaturesForTests } from "@/lib/new-features";
import type { RuntimeAuthState } from "@/hooks/use-runtime-auth";
import { __unsafeResetRuntimeAuthForTests, __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

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
    ...normalizeKbFullTextFields({}),
    ...overrides,
  };
}

const COUNTS = {
  sp: 237, gost: 609, laws: 266, snip: 57, sanpin: 26, guides: 246,
  manufacturers: 4065, international: 575, cis: 0, other: 849,
};

function renderKB(initialEntry = "/home?tab=documents&docTab=knowledge-base") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <KnowledgeBaseTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchKbFolderCounts.mockReset().mockResolvedValue(COUNTS);
  fetchKbDocumentPage.mockReset().mockResolvedValue({ rows: [doc()], total: 1 });
  fetchKbSolutions.mockReset().mockResolvedValue([]);
  fetchKbSolutionBySlug.mockReset().mockResolvedValue(null);
  fetchKbDocumentBySlug.mockReset().mockResolvedValue(null);
  fetchKbChangesFeed.mockReset().mockResolvedValue([]);
  fetchKbChangesMonthCount.mockReset().mockResolvedValue(0);
  localStorage.clear();
  resetNewFeaturesForTests();
});

describe("KnowledgeBaseTab", () => {
  it("shows the folder tiles in order with counts and descriptions, hiding empty folders", async () => {
    renderKB();
    expect(screen.getByRole("heading", { name: "Knowledge base" })).toBeInTheDocument();
    expect(screen.getByText(/Every document shows its edition/)).toBeInTheDocument();
    expect(await screen.findByText("237 documents")).toBeInTheDocument();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "What changed", "Codes of practice (SP)", "GOST", "Laws and acts", "SNiP and departmental", "SanPiN",
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

  it("puts «Следить за изменениями» in the window's footer: source, follow, close (slice 8, frame 4a)", async () => {
    __unsafeSetRuntimeAuthStateForTests({ status: "authenticated", session: null, user: null, profileId: "p1" } as unknown as RuntimeAuthState);
    try {
      renderKB();
      fireEvent.click(await screen.findByText("Codes of practice (SP)"));
      fireEvent.click(await screen.findByText("СП 71.13330 Изоляционные и отделочные покрытия"));
      const dialog = await screen.findByRole("dialog");
      const follow = await within(dialog).findByRole("button", { name: "Follow changes" });
      const footer = follow.parentElement as HTMLElement;
      const order = Array.from(footer.children).map((el) => el.textContent);
      expect(order).toEqual(["Open on the Ministry of Construction site", "Open in ConsultantPlus", "Follow changes", "Close"]);
      await waitFor(() => expect(follow).toBeEnabled());
      fireEvent.click(follow);
      expect(await within(dialog).findByRole("button", { name: "Following" })).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    } finally {
      __unsafeResetRuntimeAuthForTests();
    }
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

describe("KnowledgeBaseTab: «Решения» (slice 4)", () => {
  const walls = normalizeKbSolution(solutionRow());
  const floor = normalizeKbSolution(
    solutionRow({
      slug: "pol-v-sanuzle-pod-plitku",
      title: "Пол в санузле под плитку",
      body: { summary: "Стяжка, гидроизоляция, примыкания к стенам, приёмка", steps: [{ text: "Устроить уклон к трапу.", facts: [] }] },
      kb_solution_facts: [],
    }),
  );

  it("has no «Решения» tile while no card is published", async () => {
    renderKB();
    await screen.findByText("237 documents");
    await waitFor(() => expect(fetchKbSolutions).toHaveBeenCalled());
    expect(screen.queryByText("Solutions")).not.toBeInTheDocument();
    expect(screen.getByText(/Every document shows its edition/)).toBeInTheDocument();
  });

  it("puts a green «Решения» tile first once a card is published", async () => {
    fetchKbSolutions.mockResolvedValue([walls]);
    renderKB();
    expect(await screen.findByText("1 solution")).toBeInTheDocument();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles[0]).toBe("What changed");
    expect(titles[1]).toBe("Solutions");
    expect(titles[2]).toBe("Codes of practice (SP)");
    const tile = screen.getByText("Solutions").closest(".group") as HTMLElement;
    expect(tile.querySelector("[data-tone]")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("How to do it to code: steps, numbers, acceptance")).toBeInTheDocument();
    expect(screen.getByText(/plus ready solutions with links to the clauses/)).toBeInTheDocument();
  });

  it("lists the cards inside the folder and searches their titles, summaries and steps", async () => {
    fetchKbSolutions.mockResolvedValue([floor, walls]);
    renderKB();
    fireEvent.click(await screen.findByText("Solutions"));
    expect(await screen.findByText("Стены в санузле под плитку")).toBeInTheDocument();
    expect(screen.getByText("Пол в санузле под плитку")).toBeInTheDocument();
    expect(screen.getByText("Как подготовить стены ванной или душевой под облицовку плиткой.")).toBeInTheDocument();
    expect(screen.getAllByText("Checked 25.10.2026")).toHaveLength(2);
    expect(fetchKbDocumentPage).not.toHaveBeenCalled();

    const search = screen.getByRole("textbox", { name: "Search..." });
    fireEvent.change(search, { target: { value: "направляющую" } });
    expect(screen.getByText("Стены в санузле под плитку")).toBeInTheDocument();
    expect(screen.queryByText("Пол в санузле под плитку")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "трапу" } });
    expect(screen.getByText("Пол в санузле под плитку")).toBeInTheDocument();
    expect(screen.queryByText("Стены в санузле под плитку")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "кровля" } });
    expect(screen.getByText("Nothing found. Try one word from the title.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("GOST")).toBeInTheDocument();
  });

  it("shows matching cards first when searching from the root", async () => {
    fetchKbSolutions.mockResolvedValue([floor, walls]);
    renderKB();
    await screen.findByText("2 solutions");
    fireEvent.change(screen.getByRole("textbox", { name: "Search..." }), { target: { value: "санузле" } });
    await screen.findByText("Codes of practice (SP) · 2017 с изменениями 1-4");
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Пол в санузле под плитку", "Стены в санузле под плитку", "СП 71.13330 Изоляционные и отделочные покрытия"]);
  });

  it("from «What changed» a card goes back to the page, and back again to the root, not to «Solutions»", async () => {
    fetchKbSolutions.mockResolvedValue([walls]);
    fetchKbSolutionBySlug.mockResolvedValue(walls);
    fetchKbChangesFeed.mockResolvedValue([
      { listed_on: "2026-11-10", event: "solution_rechecked", solution_slug: walls.slug, solution_title: walls.title },
    ]);
    renderKB("/home?tab=documents&docTab=knowledge-base&kbChanges=1");
    fireEvent.click(await screen.findByRole("link", { name: `Solution «${walls.title}»` }));
    expect(await screen.findByRole("heading", { level: 1, name: walls.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("November 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("237 documents")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Knowledge base" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Solutions" })).not.toBeInTheDocument();
  });

  it("opens a card page with crumbs and comes back to the folder", async () => {
    fetchKbSolutions.mockResolvedValue([walls]);
    fetchKbSolutionBySlug.mockResolvedValue(walls);
    renderKB();
    fireEvent.click(await screen.findByText("Solutions"));
    fireEvent.click(await screen.findByText("Стены в санузле под плитку"));
    expect(await screen.findByRole("heading", { level: 1, name: "Стены в санузле под плитку" })).toBeInTheDocument();
    // The card comes from the folder's read: no second fetch, no loading line.
    expect(fetchKbSolutionBySlug).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Knowledge base" })).toHaveTextContent(
      "Knowledge base › Solutions › Стены в санузле под плитку",
    );
    // A signed-in user gets no «Спросить Шурика» until Shurik answers from the base.
    expect(screen.queryByText("Ask Shurik")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("Стены в санузле под плитку")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Solutions" })).toBeInTheDocument();
  });

  it("still shows the document folders when the cards cannot be read", async () => {
    fetchKbSolutions.mockRejectedValue(new Error("kb_solutions down"));
    renderKB();
    expect(await screen.findByText("237 documents")).toBeInTheDocument();
    // The folders did not wait for the retry of the cards.
    expect(fetchKbSolutions).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Solutions")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading tab...")).not.toBeInTheDocument();
    // One retry, then the read gives up and the tile stays away.
    await waitFor(() => expect(fetchKbSolutions).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(screen.getByText("237 documents")).toBeInTheDocument();
    expect(screen.queryByText("Solutions")).not.toBeInTheDocument();
  });

  it("shows the document folders while the cards are still on their way, and adds the tile when they arrive", async () => {
    let arrive: (cards: unknown) => void = () => {};
    fetchKbSolutions.mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    renderKB();
    expect(await screen.findByText("237 documents")).toBeInTheDocument();
    expect(screen.queryByText("Solutions")).not.toBeInTheDocument();
    arrive([walls]);
    expect(await screen.findByText("1 solution")).toBeInTheDocument();
  });

  it("with no document folders waits for the cards instead of saying the base is empty", async () => {
    fetchKbFolderCounts.mockResolvedValue(Object.fromEntries(Object.keys(COUNTS).map((k) => [k, 0])));
    let arrive: (cards: unknown) => void = () => {};
    fetchKbSolutions.mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    renderKB();
    await waitFor(() => expect(fetchKbSolutions).toHaveBeenCalled());
    // Let the counts settle while the cards are still on their way.
    await fetchKbFolderCounts.mock.results[0].value;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("There are no documents in the base yet.")).not.toBeInTheDocument();
    arrive([walls]);
    expect(await screen.findByText("1 solution")).toBeInTheDocument();
  });

  it("goes from a source chip to the clause on the reading page and back to the card", async () => {
    fetchKbSolutions.mockResolvedValue([walls]);
    fetchKbDocumentBySlug.mockResolvedValue(
      doc({ docId: "SP-155", slug: "sp-163-1325800", designation: "СП 163.1325800", title: "Конструкции с применением гипса" }),
    );
    renderKB();
    fireEvent.click(await screen.findByText("Solutions"));
    fireEvent.click(await screen.findByText("Стены в санузле под плитку"));
    const step = (await screen.findByText("Поверхности листов ГКЛВ покрыть гидроизолирующим составом.")).closest("li") as HTMLElement;
    fireEvent.click(within(step).getByRole("button", { name: "СП 163, п. 6.4.2.8" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Open the clause in the document" }));

    // The reading page of the cited document (its text is not in the base, so it says so).
    expect(await screen.findByText("The full text will appear in the base later.")).toBeInTheDocument();
    expect(fetchKbDocumentBySlug).toHaveBeenCalledWith("sp-163-1325800");
    expect(screen.queryByRole("heading", { level: 1, name: "Стены в санузле под плитку" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Стены в санузле под плитку" })).toBeInTheDocument();
  });
});

describe("KnowledgeBaseTab: «Что изменилось» (slice 8, step 8.4)", () => {
  const FEED = [
    { listed_on: "2026-11-10", event: "amendment_approved", doc_slug: "sp-29-13330", doc_heading: "СП 29.13330 · Полы", amendment_no: 5, effective_from: "2027-06-01" },
    { listed_on: "2026-11-10", event: "replaced", doc_slug: "sp-71-13330", doc_heading: "СП 71.13330 · Покрытия", replaced_by_slug: "sp-71-2026", replaced_by_heading: "СП 71.13330.2026", solutions_rechecked: 2 },
    { listed_on: "2026-10-22", event: "solution_rechecked", solution_slug: "poly", solution_title: "Полы в санузле под плитку", after_doc_slug: "sp-29-13330", after_doc_heading: "СП 29.13330", after_amendment_no: 4, after_event: "amendment_effective" },
  ];

  it("puts the tile first with the «New» mark and this month's number", async () => {
    fetchKbChangesMonthCount.mockResolvedValue(3);
    renderKB();
    await screen.findByText("237 documents");
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles[0]).toBe("What changed");
    const tile = screen.getByText("What changed").closest(".group") as HTMLElement;
    expect(within(tile).getByText("New")).toBeInTheDocument();
    expect(within(tile).getByText("New editions, cancellations and revised solutions")).toBeInTheDocument();
    expect(await within(tile).findByText(`In ${kbMonthName(kbMoscowToday(), "en")}: 3`)).toBeInTheDocument();
  });

  it("has no number line while the month had no changes", async () => {
    renderKB();
    await screen.findByText("237 documents");
    await waitFor(() => expect(fetchKbChangesMonthCount).toHaveBeenCalled());
    const tile = screen.getByText("What changed").closest(".group") as HTMLElement;
    expect(within(tile).queryByText(/^In /)).not.toBeInTheDocument();
  });

  it("opens the page: months, newest first, documents as links, the grey line, and clears the mark", async () => {
    fetchKbChangesFeed.mockResolvedValue(FEED);
    renderKB();
    fireEvent.click(await screen.findByText("What changed"));
    expect(await screen.findByRole("heading", { level: 2, name: "What changed" })).toBeInTheDocument();
    expect(screen.getByText("Once a week the base is checked against the official sources. Everything that changed after that is here.")).toBeInTheDocument();
    expect(await screen.findByText("November 2026")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    const rows = screen.getAllByTestId("kb-change");
    expect(rows.map((r) => r.querySelector("[data-kb-change-date]")?.textContent)).toEqual(["10.11.2026", "10.11.2026", "22.10.2026"]);
    expect(rows[0]).toHaveTextContent("СП 29.13330 · Полы: Amendment No. 5 approved, in force from 01.06.2027");
    expect(rows[0]).toHaveTextContent("The text stays as it is for now, the label shows a clock");
    expect(within(rows[1]).getByRole("link", { name: "СП 71.13330.2026" })).toHaveAttribute(
      "href",
      expect.stringContaining("kbDoc=sp-71-2026"),
    );
    expect(rows[1]).toHaveTextContent("Solutions rechecked against it: 2");
    expect(within(rows[2]).getByRole("link", { name: "Solution «Полы в санузле под плитку»" })).toHaveAttribute(
      "href",
      expect.stringContaining("kbSolution=poly"),
    );
    // No search on this page: a few lines a week.
    expect(screen.queryByRole("textbox", { name: "Search..." })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(NEW_FEATURES_STORAGE_KEY) ?? "{}")["kb-changes"]?.openedAt).toBeTruthy();
  });

  it("opens a document from a line and comes back to the page", async () => {
    fetchKbChangesFeed.mockResolvedValue(FEED);
    fetchKbDocumentBySlug.mockResolvedValue(doc({ slug: "sp-29-13330" }));
    renderKB("/home?tab=documents&docTab=knowledge-base&kbChanges=1");
    fireEvent.click(await screen.findByRole("link", { name: "СП 29.13330 · Полы" }));
    expect(await screen.findByText("The full text will appear in the base later.")).toBeInTheDocument();
    expect(fetchKbDocumentBySlug).toHaveBeenCalledWith("sp-29-13330");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("November 2026")).toBeInTheDocument();
  });

  it("says so while nothing has changed", async () => {
    renderKB("/home?tab=documents&docTab=knowledge-base&kbChanges=1");
    expect(await screen.findByText("Nothing has changed yet. The next check is on Monday.")).toBeInTheDocument();
  });
});
