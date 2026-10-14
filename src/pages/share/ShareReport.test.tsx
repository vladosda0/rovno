import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import ShareReport from "@/pages/share/ShareReport";

const { mockInvoke, mockDownloadPdf, mockToast } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockDownloadPdf: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("@/lib/download-pdf", () => ({ downloadNodeAsPdf: mockDownloadPdf }));

vi.mock("@/hooks/use-toast", () => ({
  toast: mockToast,
  useToast: () => ({ toast: mockToast, dismiss: vi.fn(), toasts: [] }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    rpc: vi.fn(),
  },
}));

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";
const PHOTO_URL = "https://signed.example/storage/v1/object/sign/project-media/p/kitchen.jpg?token=abc";
// The current year, so the period labels carry no year (see client-report-format).
const YEAR = new Date().getFullYear();
const local = (month: number, day: number, year = YEAR) => new Date(year, month - 1, day, 12).toISOString();

const REPORTS = [
  { id: "report-3", period_start: local(10, 9), period_end: local(10, 13), published_at: local(10, 13) },
  { id: "report-2", period_start: local(10, 2), period_end: local(10, 8), published_at: local(10, 8) },
  { id: "report-1", period_start: local(9, 25), period_end: local(10, 1), published_at: local(10, 1) },
];

function sharedReport(overrides: Record<string, unknown> = {}) {
  return {
    report: {
      ...REPORTS[0],
      note: "Плитку привезут в четверг, поэтому санузел сдвинулся на два дня.",
      body: {
        project_title: "Ленина 42",
        prepared_by: "Иван Петров",
        done: [
          { id: "task-plaster", title: "Штукатурка стен", completed_at: local(10, 10) },
          { id: "task-trash", title: "Вывоз мусора", completed_at: local(10, 13) },
        ],
        in_progress: [{ id: "task-tile", title: "Укладка плитки, санузел" }],
        next: [{ id: "task-accept", title: "Приёмка плитки", due_at: local(10, 14) }],
        progress: { done: 12, total: 28, pct: 43 },
        stages: {
          completed: 2,
          total: 4,
          items: [
            { title: "Демонтаж", state: "completed" },
            { title: "Электрика", state: "completed" },
            { title: "Чистовая отделка", state: "in_progress" },
            { title: "Мебель", state: "not_started" },
          ],
        },
      },
    },
    photos: [{ id: "media-kitchen", taskId: "task-plaster", caption: "Стены, кухня", signedUrl: PHOTO_URL }],
    reports: REPORTS,
    pdfAllowed: true,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function renderPage(path = `/share/report/${TOKEN}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/report/:token" element={<ShareReport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dead(status: number) {
  return {
    data: null,
    error: Object.assign(new Error("gone"), { context: new Response(null, { status }) }),
  };
}

/** jsdom never loads an image; these stand in for "the photo has loaded". */
function stubLoadedImages(width: number) {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(width);
}

describe("ShareReport", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeAll(async () => {
    await i18n.changeLanguage("ru");
  });

  afterAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    mockDownloadPdf.mockReset();
    mockToast.mockReset();
    stubLoadedImages(800);
  });

  it("asks the edge function for the token and renders the blocks in the client's order", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Ленина 42" })).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get-shared-report", { body: { token: TOKEN } });
    expect(screen.getByText("Отчёт за 9–13 октября · Подготовил: Иван Петров")).toBeInTheDocument();
    expect(
      screen.getByText("Плитку привезут в четверг, поэтому санузел сдвинулся на два дня."),
    ).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Сделано",
      "В процессе",
      "Дальше",
      "Прогресс · 43%",
      "Этапы · 2 из 4 завершено",
      "Предыдущие отчёты",
    ]);

    const done = screen.getByRole("region", { name: "Сделано" });
    expect(within(done).getByText("Штукатурка стен")).toBeInTheDocument();
    expect(within(done).getByText("10 октября")).toBeInTheDocument();
    expect(within(done).getByRole("img", { name: "Стены, кухня" })).toHaveAttribute("src", PHOTO_URL);
    expect(within(screen.getByRole("region", { name: "Дальше" })).getByText("14 октября")).toBeInTheDocument();
    expect(screen.getByText("12 из 28 выполнено")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Отчёт сделан в Ровно · rovno.ai" })).toHaveAttribute(
      "href",
      "https://rovno.ai",
    );
    expect(screen.getByText("Опубликован 13 октября")).toBeInTheDocument();
    // The storage location is never rendered as text, and nobody is asked to sign in.
    expect(screen.queryByText(/project-media/)).toBeNull();
    expect(screen.queryByText(/Шурик/)).toBeNull();
    expect(screen.queryByRole("link", { name: /войти|регистрац/i })).toBeNull();
  });

  it("labels a finished stage, a running one, and leaves an untouched one bare", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });

    renderPage();

    const row = async (title: string) => (await screen.findByText(title)).closest("li")!;
    expect(within(await row("Демонтаж")).getByText("Готово")).toBeInTheDocument();
    expect(within(await row("Чистовая отделка")).getByText("В процессе")).toBeInTheDocument();
    expect((await row("Мебель")).textContent).toBe("Мебель");
  });

  it("leaves out the blocks that have nothing in them", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ...sharedReport({ photos: [], reports: [REPORTS[0]] }),
        report: {
          ...REPORTS[0],
          note: "",
          body: {
            project_title: "Дача, баня",
            prepared_by: "Иван Петров",
            done: [],
            in_progress: [{ id: "task-base", title: "Фундамент под баню" }],
            next: [],
            progress: null,
            stages: { completed: 0, total: 1, items: [{ title: "Сруб", state: "in_progress" }] },
          },
        },
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Дача, баня" })).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["В процессе"]);
    expect(screen.queryByText("Сруб")).toBeNull();
  });

  it("lists the earlier reports and asks for the chosen one by report_id", async () => {
    mockInvoke.mockImplementation((_name: string, options: { body: { report_id?: string } }) =>
      Promise.resolve({
        data: options.body.report_id === "report-2"
          ? sharedReport({ report: { ...sharedReport().report, ...REPORTS[1] } })
          : sharedReport(),
        error: null,
      }),
    );

    renderPage();

    const previous = await screen.findByRole("region", { name: "Предыдущие отчёты" });
    const links = within(previous).getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["2–8 октября", "25 сентября – 1 октября"]);
    // The latest report is open: nothing to go back to.
    expect(screen.queryByRole("link", { name: "К последнему отчёту" })).toBeNull();

    fireEvent.click(within(previous).getByRole("link", { name: "2–8 октября" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("get-shared-report", {
        body: { token: TOKEN, report_id: "report-2" },
      }),
    );
    expect(await screen.findByText("Отчёт за 2–8 октября · Подготовил: Иван Петров")).toBeInTheDocument();
    // Only what was published BEFORE the open report counts as "previous".
    const older = within(screen.getByRole("region", { name: "Предыдущие отчёты" }))
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(older).toEqual(["25 сентября – 1 октября"]);
  });

  it("offers the way back to the latest report from an older one", async () => {
    mockInvoke.mockImplementation((_name: string, options: { body: { report_id?: string } }) =>
      Promise.resolve({
        data: options.body.report_id === "report-1"
          ? sharedReport({ report: { ...sharedReport().report, ...REPORTS[2] } })
          : sharedReport(),
        error: null,
      }),
    );

    renderPage(`/share/report/${TOKEN}?report=report-1`);

    expect(await screen.findByText("Отчёт за 25 сентября – 1 октября · Подготовил: Иван Петров")).toBeInTheDocument();
    // The oldest report has nothing before it.
    expect(screen.queryByRole("region", { name: "Предыдущие отчёты" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "К последнему отчёту" }));

    expect(await screen.findByText("Отчёт за 9–13 октября · Подготовил: Иван Петров")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenLastCalledWith("get-shared-report", { body: { token: TOKEN } });
    expect(screen.queryByRole("link", { name: "К последнему отчёту" })).toBeNull();
  });

  it("tells apart earlier reports with the same period, and prints the year of an old one", async () => {
    const reports = [
      REPORTS[0],
      { id: "report-b", period_start: local(10, 2), period_end: local(10, 8), published_at: local(10, 9) },
      { id: "report-a", period_start: local(10, 2), period_end: local(10, 8), published_at: local(10, 8) },
      {
        id: "report-old",
        period_start: local(10, 9, YEAR - 1),
        period_end: local(10, 13, YEAR - 1),
        published_at: local(10, 13, YEAR - 1),
      },
    ];
    mockInvoke.mockResolvedValue({ data: sharedReport({ reports }), error: null });

    renderPage();

    const previous = await screen.findByRole("region", { name: "Предыдущие отчёты" });
    expect(within(previous).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "2–8 октября · 9 октября",
      "2–8 октября · 8 октября",
      `9–13 октября ${YEAR - 1}`,
    ]);
  });

  it("opens a photo large when it is pressed", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Открыть фото крупно: Стены, кухня" }));

    const lightbox = await screen.findByRole("dialog");
    expect(within(lightbox).getByRole("img", { name: "Стены, кухня" })).toHaveAttribute("src", PHOTO_URL);
  });

  it("has no PDF button at all when the contractor's plan does not include it", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport({ pdfAllowed: false }), error: null });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Ленина 42" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Скачать PDF" })).toBeNull();
    expect(screen.queryByText(/подписк/i)).toBeNull();
    // The earlier reports are shown on every plan.
    expect(screen.getByRole("region", { name: "Предыдущие отчёты" })).toBeInTheDocument();
  });

  it("saves the report as a named file, without the button and the earlier reports in it", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });
    let drawn = "";
    let drawnPhoto: Element | null = null;
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      drawn = node.textContent ?? "";
      drawnPhoto = node.querySelector("img");
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    const [, options] = mockDownloadPdf.mock.calls[0] as [HTMLElement, { fileName: string }];
    expect(options.fileName).toBe("Ленина 42 · отчёт 9–13 октября");
    expect(drawn).toContain("Ленина 42");
    expect(drawn).toContain("Штукатурка стен");
    expect(drawn).toContain("Отчёт сделан в Ровно · rovno.ai");
    expect(drawn).not.toContain("Скачать PDF");
    expect(drawn).not.toContain("Предыдущие отчёты");
    // Photos are requested with CORS so the canvas may read them.
    expect(drawnPhoto).toHaveAttribute("src", PHOTO_URL);
    expect(drawnPhoto).toHaveAttribute("crossorigin", "anonymous");
    await waitFor(() => expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled());
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("draws a file from a page left open out of the fresh photo URLs", async () => {
    const freshUrl = "https://signed.example/storage/v1/object/sign/project-media/p/kitchen.jpg?token=fresh";
    const stale = sharedReport({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const fresh = sharedReport({
      photos: [{ id: "media-kitchen", taskId: "task-plaster", caption: "Стены, кухня", signedUrl: freshUrl }],
    });
    mockInvoke.mockResolvedValueOnce({ data: stale, error: null }).mockResolvedValue({ data: fresh, error: null });
    let drawnPhotos: Array<string | null> = [];
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      drawnPhotos = Array.from(node.querySelectorAll("img")).map((image) => image.getAttribute("src"));
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(drawnPhotos).toEqual([freshUrl]);
  });

  it("draws nothing from expired URLs when fresh ones cannot be had", async () => {
    const stale = sharedReport({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    mockInvoke.mockResolvedValueOnce({ data: stale, error: null }).mockResolvedValue(dead(500));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    // retry: 1 on the page's query, so the failing refetch lands after a back-off.
    await waitFor(
      () =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Не удалось собрать PDF. Попробуйте ещё раз.", variant: "destructive" }),
        ),
      { timeout: 5000 },
    );
    expect(mockDownloadPdf).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();
  });

  it("says that photos are missing from the file when one could not be read", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      // The CORS request for the photo fails while the file is being drawn.
      fireEvent.error(node.querySelector("img")!);
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "Часть фото не попала в файл: их не удалось загрузить." }),
    );
  });

  it("saves the file again on every press", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });
    mockDownloadPdf.mockResolvedValue(undefined);

    renderPage();
    const button = await screen.findByRole("button", { name: "Скачать PDF" });

    fireEvent.click(button);
    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);
    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("lets a failed attempt be tried again", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });
    mockDownloadPdf.mockRejectedValueOnce(new Error("canvas failed")).mockResolvedValue(undefined);

    renderPage();
    const button = await screen.findByRole("button", { name: "Скачать PDF" });

    fireEvent.click(button);
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);
    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(button).toBeEnabled());
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it("keeps the copy drawn for the file out of the tab order", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });
    let inert: string | null | undefined;
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      inert = node.parentElement?.getAttribute("inert");
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    expect(inert).toBe("");
  });

  it("says so when the file cannot be built", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });
    mockDownloadPdf.mockRejectedValue(new Error("canvas failed"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Не удалось собрать PDF. Попробуйте ещё раз.", variant: "destructive" }),
      ),
    );
  });

  it("keeps showing a photo whose host refuses a cross-origin read", async () => {
    mockInvoke.mockResolvedValue({ data: sharedReport(), error: null });

    renderPage();

    const photo = await screen.findByRole("img", { name: "Стены, кухня" });
    fireEvent.error(photo);
    const retried = screen.getByRole("img", { name: "Стены, кухня" });
    expect(retried).not.toHaveAttribute("crossorigin");

    fireEvent.error(retried);
    expect(screen.queryByRole("img", { name: "Стены, кухня" })).toBeNull();
    expect(screen.getByText("Штукатурка стен")).toBeInTheDocument();
  });

  it.each([404, 400])("shows the three not-found lines for a dead link (%i)", async (status) => {
    mockInvoke.mockResolvedValue(dead(status));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Отчёт не найден" })).toBeInTheDocument();
    expect(screen.getByText("Ссылка неверна, отозвана или устарела.")).toBeInTheDocument();
    expect(screen.getByText("Попросите новую ссылку у того, кто вам её прислал.")).toBeInTheDocument();
    expect(screen.queryByText(/Ленина 42|Иван Петров/)).toBeNull();
  });

  it("distinguishes a transport failure from a dead link and offers a retry", async () => {
    mockInvoke.mockResolvedValue(dead(500));

    renderPage();

    // retry: 1 in the page's query: the error state lands after one back-off.
    expect(await screen.findByText("Не удалось загрузить отчёт", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(screen.queryByText("Отчёт не найден")).toBeNull();
  });
});
