import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AISidebar } from "@/components/AISidebar";
import { __unsafeResetStoreForTests, addEvent, addMember, addProject, getDocuments } from "@/data/store";
import i18n from "@/i18n";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

/**
 * The AI panel groups its feed under day headers. Anything older than yesterday
 * used to go through date-fns with no locale, so a Russian interface read
 * «SEP 1, 2026». The headers, and the stamp on a saved Learn note, now follow
 * the interface language.
 *
 * Dates are built from local-time parts, so the calendar day they land on does
 * not depend on the timezone the suite runs in.
 */
const NOW = new Date(2026, 8, 10, 14, 30);
const JUL_23 = new Date(2026, 6, 23, 12, 0);
const SEP_1 = new Date(2026, 8, 1, 12, 0);
const THIS_MORNING = new Date(2026, 8, 10, 9, 0);
const YESTERDAY = new Date(2026, 8, 9, 12, 0);

let ownerId = "";
// The sidebar keeps each project's thread in a module-level map that outlives a
// test, so every test gets a project of its own.
let projectSeq = 0;
let projectId = "";

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/project/${projectId}/dashboard`]}>
        <AISidebar collapsed={false} onCollapsedChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function addTaskEvent(id: string, at: Date) {
  addEvent({
    id: `${projectId}-${id}`,
    project_id: projectId,
    actor_id: ownerId,
    type: "task_created",
    object_type: "task",
    object_id: `task-${id}`,
    timestamp: at.toISOString(),
    payload: { title: `Task ${id}` },
  });
}

function dayHeader(name: string) {
  return screen.queryByRole("button", { name });
}

describe("AISidebar dates follow the interface language", () => {
  beforeEach(() => {
    // Pinned before the store is seeded, so "today" and "yesterday" never move.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    ownerId = setStoredAuthProfile({ email: "owner@example.com", name: "Owner User" }).id;
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    projectSeq += 1;
    projectId = `project-dates-${projectSeq}`;
    addProject({
      id: projectId,
      owner_id: ownerId,
      title: `Dates ${projectSeq}`,
      type: "residential",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: projectId,
      user_id: ownerId,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage("en");
  });

  it.each([
    { lang: "ru", older: ["23 июл. 2026 г."], today: "Сегодня", yesterday: "Вчера", stale: "Jul 23, 2026" },
    { lang: "en", older: ["Jul 23, 2026"], today: "Today", yesterday: "Yesterday", stale: null },
  ])("labels feed days in the interface language ($lang)", async ({ lang, older, today, yesterday, stale }) => {
    await i18n.changeLanguage(lang);
    // Ровно три дня, не больше: лента показывает последние
    // INITIAL_VISIBLE_DAY_BUCKETS = 3 корзины, и четвёртая вытеснила бы самую
    // старую из них вместе с проверкой на неё. SEP_1 проверяется соседним
    // тестом про смену языка.
    addTaskEvent("jul-23", JUL_23);
    addTaskEvent("yesterday", YESTERDAY);
    addTaskEvent("this-morning", THIS_MORNING);

    renderSidebar();

    for (const label of older) {
      expect(dayHeader(label)).toBeInTheDocument();
    }
    expect(dayHeader(today)).toBeInTheDocument();
    // Вчерашний день тоже отдаёт t(), а не форматтер. Без этой строки правка,
    // уронившая ранний возврат по isYesterday, оставила бы тест зелёным.
    expect(dayHeader(yesterday)).toBeInTheDocument();
    if (stale) expect(dayHeader(stale)).not.toBeInTheDocument();
  });

  it("relabels the days when the interface language changes", async () => {
    addTaskEvent("sep-1", SEP_1);
    renderSidebar();
    expect(dayHeader("Sep 1, 2026")).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("ru");
    });

    expect(dayHeader("1 сент. 2026 г.")).toBeInTheDocument();
    expect(dayHeader("Sep 1, 2026")).not.toBeInTheDocument();
  });

  it("moves Today and Yesterday on when the panel stays open past midnight", () => {
    vi.setSystemTime(new Date(2026, 8, 10, 23, 59, 30));
    addTaskEvent("yesterday", YESTERDAY);
    addTaskEvent("this-morning", THIS_MORNING);
    renderSidebar();
    expect(dayHeader("Today")).toBeInTheDocument();
    expect(dayHeader("Yesterday")).toBeInTheDocument();
    // Вчерашний день раскрыт, более старые свёрнуты.
    expect(screen.getByText(/Task yesterday/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(dayHeader("Today")).not.toBeInTheDocument();
    expect(dayHeader("Yesterday")).toBeInTheDocument();
    expect(dayHeader("Sep 9, 2026")).toBeInTheDocument();
  });

  it("moves Today on when the tab comes back after sleeping past midnight", () => {
    vi.setSystemTime(new Date(2026, 8, 10, 22, 0));
    addTaskEvent("this-morning", THIS_MORNING);
    renderSidebar();
    expect(dayHeader("Today")).toBeInTheDocument();

    // Sleep pauses the timer clock: the wall clock jumps, no timer fires.
    vi.setSystemTime(new Date(2026, 8, 11, 9, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(dayHeader("Today")).not.toBeInTheDocument();
    expect(dayHeader("Yesterday")).toBeInTheDocument();
  });

  it("files a new-day event under Today before the midnight timer has fired", () => {
    vi.setSystemTime(new Date(2026, 8, 10, 23, 59, 30));
    addTaskEvent("this-morning", THIS_MORNING);
    renderSidebar();
    expect(dayHeader("Today")).toBeInTheDocument();

    // The wall clock passes midnight, but no timer and no visibility event fire.
    vi.setSystemTime(new Date(2026, 8, 11, 0, 30));
    act(() => {
      addTaskEvent("after-midnight", new Date(2026, 8, 11, 0, 20));
    });

    expect(dayHeader("Today")).toBeInTheDocument();
    expect(dayHeader("Yesterday")).toBeInTheDocument();
    expect(dayHeader("Sep 11, 2026")).not.toBeInTheDocument();
    expect(screen.getByText(/Task after-midnight/)).toBeInTheDocument();
  });

  it.each([
    { lang: "ru", stamp: "10 сент. 2026 г., 14:30" },
    { lang: "en", stamp: "Sep 10, 2026, 02:30 PM" },
  ])("stamps a saved Learn note in the interface language ($lang)", async ({ lang, stamp }) => {
    await i18n.changeLanguage(lang);
    renderSidebar();

    const composer = screen.getByRole("textbox", { name: i18n.t("ai.sidebar.composer.placeholderDefault") });
    fireEvent.change(composer, { target: { value: "Why does a slab need time to cure?" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    fireEvent.click(screen.getByTitle(i18n.t("ai.sidebar.chat.actions.saveToDocuments")));

    const note = getDocuments(projectId).find((doc) => doc.title === i18n.t("ai.sidebar.learnDoc.title"));
    const header = note?.versions[0]?.content.match(/^## (.+)$/m)?.[1];
    // ICU may put a no-break space before the day period; the reader sees a space.
    expect(header?.replace(/\s/g, " ")).toBe(stamp);
  });
});
