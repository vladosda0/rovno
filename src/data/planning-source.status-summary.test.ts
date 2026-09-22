import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Контракт `getProjectsStatusSummary` из supabase-источника: три запроса,
 * правила раскладки по корзинам и разбор встроенной строки.
 *
 * Раньше это не было покрыто ничем: три проверки на `deriveProjectStatus`
 * стерегут чистую функцию, а вся машинерия запросов жила без стража. Pre-merge
 * аудит PR #162 показал это мутацией — правки в этом слое проходили молча.
 */

type QueryResult = { data: unknown[] | null; error: unknown };

const supabaseRef = vi.hoisted(() => ({
  results: {} as Record<string, QueryResult>,
  calls: [] as { table: string; select: string; filters: string[] }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return {
      from(table: string) {
        const call = { table, select: "", filters: [] as string[] };
        supabaseRef.calls.push(call);
        // Цепочка возвращает саму себя и «разрешается» только когда её ждут:
        // источник зовёт три запроса через Promise.all, не вызывая .then руками.
        const chain: Record<string, unknown> = {
          select(columns: string) { call.select = columns; return chain; },
          in(column: string) { call.filters.push(`in:${column}`); return chain; },
          or(filter: string) { call.filters.push(`or:${filter}`); return chain; },
          then(resolve: (value: QueryResult) => unknown) {
            return Promise.resolve(
              supabaseRef.results[table] ?? { data: [], error: null },
            ).then(resolve);
          },
        };
        return chain;
      },
    };
  },
}));

const { getPlanningSource } = await import("@/data/planning-source");

const SUPABASE_MODE = { kind: "supabase" as const, profileId: "profile-1" };

async function summariesFor(projectIds: string[]) {
  const source = await getPlanningSource(SUPABASE_MODE);
  return source.getProjectsStatusSummary(projectIds);
}

beforeEach(() => {
  supabaseRef.results = {};
  supabaseRef.calls = [];
});

describe("supabase getProjectsStatusSummary", () => {
  it("даёт запись КАЖДОМУ запрошенному проекту, даже пустому", async () => {
    // Иначе проект без сметы и без задач читался бы как «ещё грузится», и
    // список прятал бы его бейдж навсегда.
    const summaries = await summariesFor(["p1", "p2"]);

    expect(Object.keys(summaries).sort()).toEqual(["p1", "p2"]);
    expect(summaries.p1).toEqual({
      executionStatus: null,
      estimateApproved: false,
      hasLinkedEstimateChecklist: false,
      taskCounts: { not_started: 0, in_progress: 0, done: 0, blocked: 0 },
    });
  });

  it("не ходит в базу вовсе, когда список пуст", async () => {
    const summaries = await summariesFor([]);

    expect(summaries).toEqual({});
    expect(supabaseRef.calls).toHaveLength(0);
  });

  it("шлёт ровно три запроса, и форма третьего — та, от которой зависит сигнал", async () => {
    // Без этой проверки удаление `!inner` и всего предиката `.or(...)` проходит
    // молча, а в проде это значит, что «В работе» получает ЛЮБОЙ проект с любым
    // пунктом чеклиста — сигнал перестаёт различать что-либо. Форма запроса и
    // есть то единственное, что решает, какие строки он увидит.
    await summariesFor(["p1"]);

    expect(supabaseRef.calls.map((call) => call.table)).toEqual([
      "tasks", "project_estimates", "task_checklist_items",
    ]);
    expect(supabaseRef.calls[2]).toMatchObject({
      select: "tasks!inner(project_id)",
      filters: [
        "in:tasks.project_id",
        "or:estimate_work_id.not.is.null,estimate_resource_line_id.not.is.null",
      ],
    });
  });

  it("раскладывает задачи по статусам и приводит легаси completed к done", async () => {
    supabaseRef.results.tasks = {
      data: [
        { project_id: "p1", status: "done" },
        { project_id: "p1", status: "completed" },
        { project_id: "p1", status: "blocked" },
        { project_id: "p2", status: "not_started" },
        { project_id: "мимо", status: "done" },
      ],
      error: null,
    };

    const summaries = await summariesFor(["p1", "p2"]);

    expect(summaries.p1.taskCounts).toEqual({
      not_started: 0, in_progress: 0, done: 2, blocked: 1,
    });
    expect(summaries.p2.taskCounts.not_started).toBe(1);
  });

  it("строка с пустым статусом НИКОГДА не затирает уже записанный", async () => {
    // Схема не запрещает второй корень сметы. Правило ровно одно, и его надо
    // стеречь: null не выигрывает у значения, в каком бы порядке ни пришли.
    supabaseRef.results.project_estimates = {
      data: [
        { project_id: "p1", status: "draft", execution_status: "paused" },
        { project_id: "p1", status: "draft", execution_status: null },
      ],
      error: null,
    };

    const summaries = await summariesFor(["p1"]);

    expect(summaries.p1.executionStatus).toBe("paused");
  });

  it("читает одобренную смету и связанный со сметой чеклист", async () => {
    supabaseRef.results.project_estimates = {
      data: [{ project_id: "p1", status: "approved", execution_status: null }],
      error: null,
    };
    supabaseRef.results.task_checklist_items = {
      data: [{ tasks: { project_id: "p2" } }],
      error: null,
    };

    const summaries = await summariesFor(["p1", "p2"]);

    expect(summaries.p1.estimateApproved).toBe(true);
    expect(summaries.p1.hasLinkedEstimateChecklist).toBe(false);
    expect(summaries.p2.hasLinkedEstimateChecklist).toBe(true);
  });

  it("разбирает встроенную связь и объектом, и массивом", async () => {
    // Живой PostgREST отдаёт объект, массива на стенде не было ни разу. Ветка
    // массива оборонительная: типы клиента её допускают, и молча получить
    // undefined вместо project_id хуже, чем разобрать обе формы.
    supabaseRef.results.task_checklist_items = {
      data: [
        { tasks: { project_id: "p1" } },
        { tasks: [{ project_id: "p2" }] },
        { tasks: null },
      ],
      error: null,
    };

    const summaries = await summariesFor(["p1", "p2"]);

    expect(summaries.p1.hasLinkedEstimateChecklist).toBe(true);
    expect(summaries.p2.hasLinkedEstimateChecklist).toBe(true);
  });

  it("отказ третьего запроса НЕ гасит статус и прогресс остальных", async () => {
    // Третий сигнал только уточняет: на стенде он переворачивает 3 проекта из
    // 38. Его отказ не должен стоить бейджа и процента всем остальным.
    supabaseRef.results.tasks = {
      data: [{ project_id: "p1", status: "done" }],
      error: null,
    };
    supabaseRef.results.project_estimates = {
      data: [{ project_id: "p1", status: "draft", execution_status: "in_work" }],
      error: null,
    };
    supabaseRef.results.task_checklist_items = {
      data: null,
      error: { message: "PostgREST не понял or= внутри встраивания" },
    };

    const summaries = await summariesFor(["p1"]);

    expect(summaries.p1.executionStatus).toBe("in_work");
    expect(summaries.p1.taskCounts.done).toBe(1);
    expect(summaries.p1.hasLinkedEstimateChecklist).toBe(false);
  });

  it("отказ запроса задач, наоборот, бросает: это сами данные, а не уточнение", async () => {
    supabaseRef.results.tasks = { data: null, error: { message: "boom" } };

    await expect(summariesFor(["p1"])).rejects.toMatchObject({ message: "boom" });
  });
});
