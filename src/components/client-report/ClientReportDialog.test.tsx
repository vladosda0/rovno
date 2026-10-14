import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { ClientReportDialog } from "@/components/client-report/ClientReportDialog";

const { mockRpc, mockToast, mockCreateSignedUrl, mockDownloadPdf, mediaRows } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockToast: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockDownloadPdf: vi.fn(),
  mediaRows: { current: [] as unknown[] },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    functions: { invoke: vi.fn() },
    storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) },
  },
}));

vi.mock("@/lib/download-pdf", () => ({ downloadNodeAsPdf: mockDownloadPdf }));

vi.mock("@/hooks/use-mock-data", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-mock-data")>("@/hooks/use-mock-data");
  return { ...actual, useMedia: () => mediaRows.current };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: mockToast,
  useToast: () => ({ toast: mockToast, dismiss: vi.fn(), toasts: [] }),
}));

const TOKEN = "a8f3c1a8f3c1a8f3c1a8f3c1a8f3c1a8f3c1a8f3c1a8f3c1";
// The current year, so the period labels carry no year (see client-report-format).
const YEAR = new Date().getFullYear();
const local = (month: number, day: number) => new Date(YEAR, month - 1, day, 12).toISOString();

/** Noon of the day `days` before today, for the tests of the custom period. */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function inputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function brigadePreview(overrides: Record<string, unknown> = {}) {
  return preview({
    period_start: daysAgo(5).toISOString(),
    period_end: new Date().toISOString(),
    quota: quota({ plan_code: "brigade", custom_period_allowed: true, min_interval_days: null }),
    ...overrides,
  });
}

/** What the server answers once a report is out: a new empty period, the link, the used-up quota. */
function afterPublish() {
  return preview({
    period_start: local(10, 13),
    period_end: local(10, 14),
    body: { done: [], photos: [], in_progress: [], next: [], progress: null, stages: null },
    quota: quota({ can_publish: false, next_publish_at: local(10, 20) }),
    link: { share_token: TOKEN, created_at: local(10, 13) },
    last_report: { id: "report-1", published_at: local(10, 13), period_start: local(10, 9), period_end: local(10, 13), visible: true },
  });
}

/** jsdom never loads an image; these stand in for "the photo has loaded". */
function stubLoadedImages(width: number) {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(width);
}

type RpcAnswer = unknown | ((args: Record<string, unknown>, call: number) => unknown);
const fail = (error: unknown) => ({ __error: error });

function quota(overrides: Record<string, unknown> = {}) {
  return {
    plan_code: "master",
    rhythm: "weekly",
    reminder_enabled: true,
    rhythm_locked: false,
    min_interval_days: 7,
    custom_period_allowed: false,
    pdf_allowed: true,
    last_published_at: null,
    next_publish_at: null,
    can_publish: true,
    ...overrides,
  };
}

function preview(overrides: Record<string, unknown> = {}) {
  return {
    project_title: "Ленина 42",
    prepared_by: "Иван Петров",
    period_start: local(10, 9),
    period_end: local(10, 13),
    body: {
      done: [
        { id: "task-plaster", title: "Штукатурка стен", completed_at: local(10, 10) },
        { id: "task-trash", title: "Вывоз мусора", completed_at: local(10, 13) },
      ],
      photos: [{ id: "media-kitchen", task_id: "task-plaster", caption: "Стены, кухня" }],
      in_progress: [{ id: "task-tile", title: "Укладка плитки, санузел" }],
      next: [{ id: "task-accept", title: "Приёмка плитки", due_at: local(10, 14) }],
      progress: { done: 12, total: 28, pct: 43 },
      stages: { completed: 3, total: 7, items: [] },
    },
    quota: quota(),
    link: null,
    last_report: null,
    ...overrides,
  };
}

/**
 * Routes each RPC name to its answer, so a test states only what it changes.
 * An answer may be a function of the arguments and the call's ordinal, and may
 * return a promise.
 */
function answerRpc(answers: Record<string, RpcAnswer>) {
  const counts: Record<string, number> = {};
  mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (!(name in answers)) return { data: null, error: new Error(`unexpected rpc ${name}`) };
    counts[name] = (counts[name] ?? 0) + 1;
    const given = answers[name];
    const answer = await (typeof given === "function" ? given(args, counts[name]) : given);
    if (answer && typeof answer === "object" && "__error" in answer) {
      return { data: null, error: (answer as { __error: unknown }).__error };
    }
    return { data: answer, error: null };
  });
}

function rpcCalls(name: string) {
  return mockRpc.mock.calls.filter(([called]) => called === name);
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientReportDialog open onOpenChange={vi.fn()} projectId="project-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ClientReportDialog", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("ru");
  });

  afterAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    mockRpc.mockReset();
    mockToast.mockReset();
    mockDownloadPdf.mockReset();
    mockCreateSignedUrl.mockReset();
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: null });
    mediaRows.current = [];
    stubLoadedImages(800);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks for the preview and renders the blocks the client will see", async () => {
    answerRpc({ preview_client_report: preview() });

    renderDialog();

    expect(await screen.findByRole("heading", { name: "Отчёт клиенту · Ленина 42" })).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledWith("preview_client_report", {
      p_project_id: "project-1",
      p_from: null,
      p_to: null,
    });
    expect(screen.getByText("Так отчёт увидит клиент. Убери лишнее и опубликуй.")).toBeInTheDocument();
    expect(screen.getByText("9–13 октября")).toBeInTheDocument();
    expect(screen.getByText("Сделано")).toBeInTheDocument();
    expect(screen.getByText("✓ Штукатурка стен")).toBeInTheDocument();
    expect(screen.getByText("Стены, кухня")).toBeInTheDocument();
    expect(screen.getByText("В процессе")).toBeInTheDocument();
    expect(screen.getByText("⏳ Укладка плитки, санузел")).toBeInTheDocument();
    expect(screen.getByText("Дальше")).toBeInTheDocument();
    expect(screen.getByText("Приёмка плитки · 14 октября")).toBeInTheDocument();
    expect(screen.getByText("Прогресс 43% · 12 из 28 выполнено")).toBeInTheDocument();
    expect(screen.getByText("Этапы: 3 из 7 завершено")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
    // No link yet, so nothing to copy or revoke.
    expect(screen.queryByRole("button", { name: "Скопировать ссылку" })).toBeNull();
  });

  it("strikes a removed task through and sends its id on publish", async () => {
    answerRpc({
      preview_client_report: (_args: unknown, call: number) =>
        call === 1 ? preview() : afterPublish(),
      publish_client_report: {
        report_id: "report-1",
        published_at: local(10, 13),
        share_token: TOKEN,
        quota: quota({ can_publish: false, next_publish_at: local(10, 20) }),
      },
    });

    renderDialog();
    await screen.findByText("✓ Вывоз мусора");

    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Вывоз мусора" }));
    expect(screen.getByText("✓ Вывоз мусора")).toHaveClass("line-through");
    expect(screen.getByRole("button", { name: "Вернуть в отчёт: Вывоз мусора" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Стены, кухня" }));
    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Этапы: 3 из 7 завершено" }));
    fireEvent.change(screen.getByLabelText("Пара слов от тебя"), {
      target: { value: "Плитку привезут в четверг." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() => expect(rpcCalls("publish_client_report")).toHaveLength(1));
    expect(rpcCalls("publish_client_report")[0][1]).toEqual({
      p_project_id: "project-1",
      p_note: "Плитку привезут в четверг.",
      p_excluded_task_ids: ["task-trash"],
      p_excluded_media_ids: ["media-kitchen"],
      p_hide: ["stages"],
      p_from: null,
      p_to: null,
    });
  });

  it("shows the link, the copy action and the notice after publishing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    answerRpc({
      preview_client_report: (_args: unknown, call: number) =>
        call === 1 ? preview() : afterPublish(),
      publish_client_report: {
        report_id: "report-1",
        published_at: local(10, 13),
        share_token: TOKEN,
        quota: quota({ can_publish: false, next_publish_at: local(10, 20) }),
      },
    });

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Опубликовать" }));

    expect(
      await screen.findByText("Опубликовано 13 октября. Клиент видит этот отчёт по ссылке."),
    ).toBeInTheDocument();
    const link = `${window.location.origin}/share/report/${TOKEN}`;
    expect(screen.getByDisplayValue(link)).toBeInTheDocument();
    expect(
      screen.getByText("Любой, у кого есть ссылка, увидит отчёты по этому проекту без входа в приложение."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
  });

  it("re-reads the preview after publishing and draws the PDF from what was published", async () => {
    answerRpc({
      preview_client_report: (_args: unknown, call: number) => (call === 1 ? preview() : afterPublish()),
      publish_client_report: {
        report_id: "report-1",
        published_at: local(10, 13),
        share_token: TOKEN,
        quota: quota({ can_publish: false, next_publish_at: local(10, 20) }),
      },
    });
    let drawn = "";
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      drawn = node.textContent ?? "";
    });

    renderDialog();
    await screen.findByText("✓ Вывоз мусора");
    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Вывоз мусора" }));
    fireEvent.change(screen.getByLabelText("Пара слов от тебя"), { target: { value: "Плитку привезут в четверг." } });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    await screen.findByText("Опубликовано 13 октября. Клиент видит этот отчёт по ссылке.");
    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));
    // The live preview is now the next, empty period; the file is the published report.
    await waitFor(() => expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    expect(mockDownloadPdf.mock.calls[0][1]).toMatchObject({ fileName: "Ленина 42 · отчёт 9–13 октября" });
    expect(drawn).toContain("Отчёт за 9–13 октября · Подготовил: Иван Петров");
    expect(drawn).toContain("Плитку привезут в четверг.");
    expect(drawn).toContain("Штукатурка стен");
    expect(drawn).toContain("Опубликован 13 октября");
    expect(drawn).not.toContain("Вывоз мусора");
  });

  it("shows the existing link on open, revokes it through the RPC and re-reads the preview", async () => {
    answerRpc({
      preview_client_report: (_args: unknown, call: number) =>
        call === 1
          ? preview({ link: { share_token: TOKEN, created_at: local(10, 1) } })
          : preview({ period_start: local(10, 14), period_end: local(10, 15), link: null }),
      revoke_client_report_link: true,
    });

    renderDialog();

    const link = `${window.location.origin}/share/report/${TOKEN}`;
    expect(await screen.findByDisplayValue(link)).toBeInTheDocument();
    expect(screen.getByText("9–13 октября")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отозвать ссылку" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Отозвать ссылку" }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith("revoke_client_report_link", { p_project_id: "project-1" }),
    );
    await waitFor(() => expect(screen.queryByDisplayValue(link)).toBeNull());
    // The editor follows the server again: its current default period.
    expect(await screen.findByText("14–15 октября")).toBeInTheDocument();
    expect(rpcCalls("preview_client_report")).toHaveLength(2);
  });

  it("locks the rhythm on the Free plan and says when the next report is possible", async () => {
    answerRpc({
      preview_client_report: preview({
        quota: quota({
          plan_code: "free",
          rhythm: "monthly",
          rhythm_locked: true,
          min_interval_days: 30,
          pdf_allowed: false,
          can_publish: false,
          next_publish_at: local(11, 12),
        }),
      }),
    });

    renderDialog();

    expect(
      await screen.findByText("Еженедельный отчёт доступен по подписке «Мастер» или «Бригада»."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Еженедельный" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Ежемесячный" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(
      screen.getByText(/На тарифе «Бесплатно» один отчёт в 30 дней\. Следующий можно опубликовать 12 ноября\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Улучшить тариф" })).toHaveAttribute("href", "/settings?tab=billing");
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();
    expect(screen.getByText("Скачивание PDF доступно по подписке «Мастер» или «Бригада».")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Еженедельный" }));
    expect(rpcCalls("set_client_report_settings")).toHaveLength(0);
  });

  it("disables publishing on Master until the next date and names Brigade", async () => {
    answerRpc({
      preview_client_report: preview({
        quota: quota({ can_publish: false, next_publish_at: local(10, 20) }),
      }),
    });

    renderDialog();

    expect(await screen.findByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(
      screen.getByText(
        /Следующий отчёт можно опубликовать 20 октября\. Сколько угодно отчётов за любой период доступно на тарифе «Бригада»\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Еженедельный отчёт доступен по подписке «Мастер» или «Бригада».")).toBeNull();
    // Reading and saving the report stays possible while publishing waits.
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();
    expect(screen.queryByText("Скачивание PDF доступно по подписке «Мастер» или «Бригада».")).toBeNull();
  });

  it("saves the PDF from the client's view with the removed lines left out", async () => {
    const signedUrl = "https://signed.example/storage/v1/object/sign/project-media/kitchen.jpg?token=abc";
    mediaRows.current = [
      {
        id: "media-kitchen",
        project_id: "project-1",
        caption: "Стены, кухня",
        storage: { id: "s1", bucket: "project-media", objectPath: "p/kitchen.jpg", filename: "kitchen.jpg", mimeType: "image/jpeg", sizeBytes: 1 },
      },
    ];
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl }, error: null });
    let drawn = "";
    let drawnPhoto: string | null = null;
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      drawn = node.textContent ?? "";
      drawnPhoto = node.querySelector("img")?.getAttribute("src") ?? null;
    });
    answerRpc({ preview_client_report: preview() });

    renderDialog();
    await screen.findByText("✓ Вывоз мусора");
    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Вывоз мусора" }));
    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Прогресс 43% · 12 из 28 выполнено" }));
    fireEvent.change(screen.getByLabelText("Пара слов от тебя"), { target: { value: "Плитку привезут в четверг." } });

    fireEvent.click(screen.getByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    expect(mockDownloadPdf.mock.calls[0][1]).toMatchObject({ fileName: "Ленина 42 · отчёт 9–13 октября" });
    expect(drawn).toContain("Отчёт за 9–13 октября · Подготовил: Иван Петров");
    expect(drawn).toContain("Плитку привезут в четверг.");
    expect(drawn).toContain("Штукатурка стен");
    expect(drawn).toContain("Отчёт сделан в Ровно · rovno.ai");
    expect(drawn).not.toContain("Вывоз мусора");
    expect(drawn).not.toContain("Прогресс");
    expect(drawnPhoto).toBe(signedUrl);
    expect(mockToast).not.toHaveBeenCalled();
    // The off-screen copy is gone once the file is saved, and the button works again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled());
    expect(document.body.textContent).not.toContain("Отчёт сделан в Ровно");
  });

  it("says so when the PDF cannot be built", async () => {
    mockDownloadPdf.mockRejectedValue(new Error("canvas failed"));
    answerRpc({ preview_client_report: preview() });

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Не удалось собрать PDF. Попробуй ещё раз.", variant: "destructive" }),
      ),
    );
  });

  it("saves the rhythm and the reminder through the settings RPC", async () => {
    answerRpc({
      preview_client_report: preview(),
      set_client_report_settings: quota({ rhythm: "monthly" }),
    });

    renderDialog();

    fireEvent.click(await screen.findByRole("radio", { name: "Ежемесячный" }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith("set_client_report_settings", {
        p_project_id: "project-1",
        p_rhythm: "monthly",
        p_reminder_enabled: true,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Ежемесячный" })).toHaveAttribute("aria-checked", "true"),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Шурик напоминает, когда пора" }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith("set_client_report_settings", {
        p_project_id: "project-1",
        p_rhythm: "monthly",
        p_reminder_enabled: false,
      }),
    );
  });

  it("explains an empty period and refuses to publish nothing", async () => {
    answerRpc({
      preview_client_report: preview({
        project_title: "Дача, баня",
        period_start: local(10, 6),
        body: { done: [], photos: [], in_progress: [], next: [], progress: null, stages: { completed: 1, total: 1, items: [] } },
      }),
    });

    renderDialog();

    expect(
      await screen.findByText(
        "С 6 октября не закрыто ни одной задачи и нет новых фото. У клиента этого блока не будет.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("В процессе")).toBeNull();
    expect(screen.queryByText("Прогресс и этапы")).toBeNull();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Пара слов от тебя"), { target: { value: "На этой неделе ждём брус." } });
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
  });

  it("asks for a custom period on blur, not on every keystroke", async () => {
    answerRpc({ preview_client_report: brigadePreview() });

    renderDialog();

    const from = (await screen.findByLabelText("Начало периода")) as HTMLInputElement;
    expect(from.value).toBe(inputValue(daysAgo(5)));

    // A year typed digit by digit passes through values like these.
    fireEvent.change(from, { target: { value: "0002-10-01" } });
    fireEvent.change(from, { target: { value: "0202-10-01" } });
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    expect(rpcCalls("preview_client_report")).toHaveLength(1);

    fireEvent.blur(from);

    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));
    const args = rpcCalls("preview_client_report")[1][1] as { p_from: string; p_to: string };
    const sentFrom = new Date(args.p_from);
    expect(inputValue(sentFrom)).toBe(inputValue(daysAgo(10)));
    expect(sentFrom.getHours()).toBe(0);
    expect(inputValue(new Date(args.p_to))).toBe(inputValue(new Date()));
  });

  it("commits the period on Enter as well", async () => {
    answerRpc({ preview_client_report: brigadePreview() });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.keyDown(from, { key: "Enter" });

    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));
  });

  it.each([
    ["a year still being typed", "from", "0002-10-01"],
    ["a start older than five years", "from", `${YEAR - 6}-01-01`],
    ["an emptied end", "to", ""],
  ])("puts the committed dates back and sends nothing for %s", async (_name, edge, value) => {
    answerRpc({ preview_client_report: brigadePreview() });

    renderDialog();
    const label = edge === "from" ? "Начало периода" : "Конец периода";
    const input = (await screen.findByLabelText(label)) as HTMLInputElement;
    const committed = input.value;

    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);

    expect(input.value).toBe(committed);
    expect(rpcCalls("preview_client_report")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Начало периода должно быть раньше конца, а конец не позже сегодня.",
    );
    // Shown once: the next keystroke starts clean.
    fireEvent.change(input, { target: { value: inputValue(daysAgo(3)) } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a start later than the end in the input until the end catches up", async () => {
    // A committed period in the past: 40 to 30 days ago.
    answerRpc({
      preview_client_report: brigadePreview({
        period_start: daysAgo(40).toISOString(),
        period_end: daysAgo(30).toISOString(),
      }),
    });

    renderDialog();
    const from = (await screen.findByLabelText("Начало периода")) as HTMLInputElement;
    const to = screen.getByLabelText("Конец периода") as HTMLInputElement;

    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);

    expect(from.value).toBe(inputValue(daysAgo(10)));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Начало периода должно быть раньше конца, а конец не позже сегодня.",
    );
    expect(rpcCalls("preview_client_report")).toHaveLength(1);

    fireEvent.change(to, { target: { value: inputValue(daysAgo(5)) } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.blur(to);

    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));
    const args = rpcCalls("preview_client_report")[1][1] as { p_from: string; p_to: string };
    expect(inputValue(new Date(args.p_from))).toBe(inputValue(daysAgo(10)));
    expect(inputValue(new Date(args.p_to))).toBe(inputValue(daysAgo(5)));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the end typed while the preview for a new start is loading", async () => {
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => { release = resolve; });
    answerRpc({
      preview_client_report: (_args: unknown, call: number) => (call === 1 ? brigadePreview() : pending),
    });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    const to = screen.getByLabelText("Конец периода") as HTMLInputElement;
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);
    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));

    fireEvent.change(to, { target: { value: inputValue(daysAgo(2)) } });
    release(brigadePreview({ period_start: daysAgo(10).toISOString() }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    expect(to.value).toBe(inputValue(daysAgo(2)));
  });

  it("keeps the end typed when the preview for a new start fails", async () => {
    answerRpc({
      preview_client_report: (args: { p_from: string | null }) =>
        args.p_from === null ? brigadePreview() : fail({ message: "boom" }),
    });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    const to = screen.getByLabelText("Конец периода") as HTMLInputElement;
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);
    await waitFor(() => expect(rpcCalls("preview_client_report").length).toBeGreaterThan(1));

    fireEvent.change(to, { target: { value: inputValue(daysAgo(2)) } });

    await waitFor(
      () =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Не удалось собрать отчёт. Попробуй ещё раз." }),
        ),
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    expect(to.value).toBe(inputValue(daysAgo(2)));
  });

  it("shows the quota of a re-read of the same period over a setting saved before it", async () => {
    answerRpc({
      preview_client_report: (_args: unknown, call: number) =>
        call === 1
          ? preview({ link: { share_token: TOKEN, created_at: local(10, 1) } })
          : preview({ quota: quota({ rhythm: "monthly", can_publish: false, next_publish_at: local(10, 20) }) }),
      set_client_report_settings: quota({ rhythm: "monthly" }),
      revoke_client_report_link: true,
    });

    renderDialog();
    fireEvent.click(await screen.findByRole("radio", { name: "Ежемесячный" }));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Ежемесячный" })).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Отозвать ссылку" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Отозвать ссылку" }));

    // Same period, so the same query is read again; its quota is newer than the saved setting.
    expect(await screen.findByText(/Следующий отчёт можно опубликовать 20 октября\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(rpcCalls("preview_client_report")).toHaveLength(2);
  });

  it("holds publishing and the PDF while the dates in the inputs do not make a period", async () => {
    answerRpc({
      preview_client_report: brigadePreview({
        period_start: daysAgo(40).toISOString(),
        period_end: daysAgo(30).toISOString(),
      }),
      publish_client_report: fail({ message: "must not be called" }),
    });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();

    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(rpcCalls("publish_client_report")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Конец периода"), { target: { value: inputValue(daysAgo(5)) } });
    fireEvent.blur(screen.getByLabelText("Конец периода"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();
  });

  async function publishThenRevoke() {
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    await screen.findByText(/Клиент видит этот отчёт по ссылке\./);
    fireEvent.click(screen.getByRole("button", { name: "Отозвать ссылку" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Отозвать ссылку" }));
    return (await screen.findByLabelText("Начало периода")) as HTMLInputElement;
  }

  const publishAnswers = () => ({
    preview_client_report: brigadePreview({ link: { share_token: TOKEN, created_at: new Date().toISOString() } }),
    publish_client_report: {
      report_id: "report-1",
      published_at: new Date().toISOString(),
      share_token: TOKEN,
      quota: quota({ plan_code: "brigade", custom_period_allowed: true, min_interval_days: null }),
    },
    revoke_client_report_link: true,
  });

  it("drops a date left typed in the input once the report is published", async () => {
    answerRpc(publishAnswers());

    renderDialog();
    const from = (await screen.findByLabelText("Начало периода")) as HTMLInputElement;
    const committed = from.value;
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });

    const after = await publishThenRevoke();

    expect(after.value).toBe(committed);
  });

  it("drops the line about the dates once the report is published", async () => {
    answerRpc(publishAnswers());

    renderDialog();
    const to = await screen.findByLabelText("Конец периода");
    fireEvent.change(to, { target: { value: "" } });
    fireEvent.blur(to);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await publishThenRevoke();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("locks the rhythm and the reminder while the lists are loading", async () => {
    const pending = new Promise(() => {});
    answerRpc({
      preview_client_report: (_args: unknown, call: number) => (call === 1 ? brigadePreview() : pending),
    });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    expect(screen.getByRole("switch", { name: "Шурик напоминает, когда пора" })).toBeEnabled();
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);

    await waitFor(() => expect(screen.getByRole("switch", { name: "Шурик напоминает, когда пора" })).toBeDisabled());
    expect(screen.getByRole("radio", { name: "Ежемесячный" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Ежемесячный" }));
    expect(rpcCalls("set_client_report_settings")).toHaveLength(0);
  });

  it("keeps a setting saved after a preview was asked for when that preview arrives", async () => {
    let releaseSave: (value: unknown) => void = () => {};
    let releasePreview: (value: unknown) => void = () => {};
    const save = new Promise((resolve) => { releaseSave = resolve; });
    const slowPreview = new Promise((resolve) => { releasePreview = resolve; });
    const brigadeQuota = quota({ plan_code: "brigade", custom_period_allowed: true, min_interval_days: null });
    answerRpc({
      preview_client_report: (_args: unknown, call: number) => (call === 1 ? brigadePreview() : slowPreview),
      set_client_report_settings: save,
    });

    renderDialog();
    // The save goes out first, then a new period is asked for while it is pending.
    fireEvent.click(await screen.findByRole("radio", { name: "Ежемесячный" }));
    const from = screen.getByLabelText("Начало периода");
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);
    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));

    releaseSave({ ...brigadeQuota, rhythm: "monthly" });
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Ежемесячный" })).toHaveAttribute("aria-checked", "true"),
    );
    // The preview was asked for before the save landed and still says "weekly".
    releasePreview(brigadePreview({ period_start: daysAgo(10).toISOString() }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Ежемесячный" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps the copy drawn for the PDF out of the tab order", async () => {
    let inert: string | null | undefined;
    mockDownloadPdf.mockImplementation(async (node: HTMLElement) => {
      inert = node.parentElement?.getAttribute("inert");
    });
    answerRpc({ preview_client_report: preview() });

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    expect(inert).toBe("");
  });

  it("clamps an end in the future to today, in the request and in the input", async () => {
    answerRpc({
      preview_client_report: (_args: unknown, call: number) =>
        call === 1 ? brigadePreview({ period_end: daysAgo(2).toISOString() }) : brigadePreview(),
    });

    renderDialog();
    const to = (await screen.findByLabelText("Конец периода")) as HTMLInputElement;
    expect(to).toHaveAttribute("max", inputValue(new Date()));

    fireEvent.change(to, { target: { value: inputValue(daysAgo(-30)) } });
    fireEvent.blur(to);

    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));
    const args = rpcCalls("preview_client_report")[1][1] as { p_to: string };
    expect(inputValue(new Date(args.p_to))).toBe(inputValue(new Date()));
    expect(to.value).toBe(inputValue(new Date()));
  });

  it("holds publishing and the PDF while the lists of a new period are loading", async () => {
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => { release = resolve; });
    answerRpc({
      preview_client_report: (_args: unknown, call: number) => (call === 1 ? brigadePreview() : pending),
      publish_client_report: fail({ message: "must not be called" }),
    });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
    expect(screen.getByTestId("client-report-lists")).not.toHaveClass("opacity-50");

    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);

    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();
    expect(screen.getByTestId("client-report-lists")).toHaveClass("opacity-50");
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(rpcCalls("publish_client_report")).toHaveLength(0);

    release(brigadePreview({ period_start: daysAgo(10).toISOString() }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();
    expect(screen.getByTestId("client-report-lists")).not.toHaveClass("opacity-50");
  });

  it("keeps the editor, the note and the removed lines when a new period fails to load", async () => {
    answerRpc({
      preview_client_report: (args: { p_from: string | null }) =>
        args.p_from === null ? brigadePreview() : fail({ message: "boom" }),
    });

    renderDialog();
    const from = (await screen.findByLabelText("Начало периода")) as HTMLInputElement;
    const committed = from.value;
    fireEvent.change(screen.getByLabelText("Пара слов от тебя"), { target: { value: "Плитку привезут в четверг." } });
    fireEvent.click(screen.getByRole("button", { name: "Убрать из отчёта: Вывоз мусора" }));

    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);

    // One retry with a back-off before the failure lands.
    await waitFor(
      () =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Не удалось собрать отчёт. Попробуй ещё раз.", variant: "destructive" }),
        ),
      { timeout: 5000 },
    );
    expect(screen.getByRole("heading", { name: "Отчёт клиенту · Ленина 42" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
    expect(screen.getByLabelText("Пара слов от тебя")).toHaveValue("Плитку привезут в четверг.");
    expect(screen.getByText("✓ Вывоз мусора")).toHaveClass("line-through");
    expect(from.value).toBe(committed);
    // Back on the last period that loaded, so the editor is usable again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());
    const last = rpcCalls("preview_client_report").at(-1)![1] as { p_from: string | null };
    expect(last.p_from).toBeNull();
  });

  it("returns to the default period when the server refuses the chosen one", async () => {
    answerRpc({
      preview_client_report: (args: { p_from: string | null }) =>
        args.p_from === null
          ? brigadePreview()
          : fail({ message: "client_report_bad_period", code: "22023" }),
    });

    renderDialog();
    const from = (await screen.findByLabelText("Начало периода")) as HTMLInputElement;
    const committed = from.value;
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Такой период выбрать нельзя. Вернул период по умолчанию." }),
      ),
    );
    // No retry for a refusal: default, the refused range, default again.
    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(3));
    expect(rpcCalls("preview_client_report")[2][1]).toMatchObject({ p_from: null, p_to: null });
    expect(from.value).toBe(committed);
    expect(screen.getByText("✓ Штукатурка стен")).toBeInTheDocument();
  });

  it("returns to the default period when publishing is refused for the period", async () => {
    answerRpc({
      preview_client_report: brigadePreview(),
      publish_client_report: fail({ message: "client_report_bad_period", code: "22023" }),
    });

    renderDialog();
    const from = await screen.findByLabelText("Начало периода");
    fireEvent.change(from, { target: { value: inputValue(daysAgo(10)) } });
    fireEvent.blur(from);
    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Опубликовать" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Такой период выбрать нельзя. Вернул период по умолчанию." }),
      ),
    );
    // The publish carried the range of the lists on screen.
    const sent = rpcCalls("publish_client_report")[0][1] as { p_from: string };
    expect(inputValue(new Date(sent.p_from))).toBe(inputValue(daysAgo(10)));
    await waitFor(() => expect(rpcCalls("preview_client_report")).toHaveLength(3));
    expect(rpcCalls("preview_client_report")[2][1]).toMatchObject({ p_from: null, p_to: null });
  });

  it("says that photos are missing from the PDF when one has no file to read", async () => {
    // No media row for the photo in the report body.
    mockDownloadPdf.mockResolvedValue(undefined);
    answerRpc({ preview_client_report: preview() });

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Скачать PDF" }));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "Часть фото не попала в файл: их не удалось загрузить." }),
    );
  });

  it("names the buttons of photos without a caption by their number", async () => {
    answerRpc({
      preview_client_report: preview({
        body: {
          done: [],
          photos: [
            { id: "media-1", task_id: null, caption: null },
            { id: "media-2", task_id: null, caption: "" },
          ],
          in_progress: [],
          next: [],
          progress: null,
          stages: null,
        },
      }),
      publish_client_report: fail({ message: "boom" }),
    });

    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Убрать из отчёта: Фото 2" }));

    expect(screen.getByRole("button", { name: "Убрать из отчёта: Фото 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуть в отчёт: Фото 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    await waitFor(() => expect(rpcCalls("publish_client_report")).toHaveLength(1));
    expect(rpcCalls("publish_client_report")[0][1]).toMatchObject({ p_excluded_media_ids: ["media-2"] });
  });

  it("turns a limit refusal on publish into the date line instead of a toast", async () => {
    answerRpc({
      preview_client_report: preview(),
      publish_client_report: {
        __error: {
          message: "client_report_limit",
          code: "P0001",
          hint: JSON.stringify({ reason: "tier_limit", plan_code: "master", next_publish_at: local(10, 20) }),
        },
      },
    });

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Опубликовать" }));

    expect(await screen.findByText(/Следующий отчёт можно опубликовать 20 октября\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
