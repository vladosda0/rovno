import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown[] | null; error: unknown };

const supabaseRef = vi.hoisted(() => ({
  results: [] as QueryResult[],
  calls: [] as { table: string; select: string; filters: string[] }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return {
      from(table: string) {
        const call = { table, select: "", filters: [] as string[] };
        supabaseRef.calls.push(call);
        const chain: Record<string, unknown> = {
          select(columns: string) { call.select = columns; return chain; },
          in(column: string, values: string[]) { call.filters.push(`in:${column}:${values.join(",")}`); return chain; },
          order(column: string) { call.filters.push(`order:${column}`); return chain; },
          or(filter: string) { call.filters.push(`or:${filter}`); return chain; },
          limit(count: number) { call.filters.push(`limit:${count}`); return chain; },
          then(resolve: (value: QueryResult) => unknown) {
            return Promise.resolve(supabaseRef.results.shift() ?? { data: [], error: null }).then(resolve);
          },
        };
        return chain;
      },
    };
  },
}));

const { getPlanningSource } = await import("@/data/planning-source");

const SUPABASE_MODE = { kind: "supabase" as const, profileId: "profile-1" };

beforeEach(() => {
  supabaseRef.results = [];
  supabaseRef.calls = [];
});

describe("supabase getWorkspaceTasks", () => {
  it("reads the tasks of all given projects and maps the rows", async () => {
    supabaseRef.results = [{
      data: [{
        id: "t1",
        project_id: "p2",
        stage_id: "s1",
        estimate_work_id: null,
        title: "Поставить окна",
        description: null,
        status: "in_progress",
        assignee_profile_id: null,
        created_by: "u1",
        created_at: "2026-11-01T00:00:00.000Z",
        start_at: null,
        due_at: "2026-11-10T00:00:00.000Z",
      }],
      error: null,
    }];
    const source = await getPlanningSource(SUPABASE_MODE);

    const tasks = await source.getWorkspaceTasks(["p1", "p2"]);

    expect(supabaseRef.calls).toHaveLength(2);
    expect(supabaseRef.calls[0].table).toBe("tasks");
    expect(supabaseRef.calls[0].filters).toContain("in:project_id:p1,p2");
    expect(tasks).toEqual([expect.objectContaining({
      id: "t1",
      project_id: "p2",
      title: "Поставить окна",
      status: "in_progress",
      deadline: "2026-11-10T00:00:00.000Z",
    })]);
  });

  it("sends no query for an empty project list", async () => {
    const source = await getPlanningSource(SUPABASE_MODE);

    await expect(source.getWorkspaceTasks([])).resolves.toEqual([]);
    expect(supabaseRef.calls).toHaveLength(0);
  });

  it("throws the query error instead of returning no tasks", async () => {
    supabaseRef.results = [{ data: null, error: new Error("permission denied") }];
    const source = await getPlanningSource(SUPABASE_MODE);

    await expect(source.getWorkspaceTasks(["p1"])).rejects.toThrow("permission denied");
  });

  it("reads each next page strictly after the last row read, until an empty page", async () => {
    const row = (n: number) => ({
      id: `t${String(n).padStart(4, "0")}`,
      project_id: "p1",
      stage_id: "s1",
      estimate_work_id: null,
      title: `Задача ${n}`,
      description: null,
      status: "not_started",
      assignee_profile_id: null,
      created_by: "u1",
      created_at: "2026-11-01T00:00:00.000Z",
      start_at: null,
      due_at: null,
    });
    supabaseRef.results = [
      { data: Array.from({ length: 1000 }, (_, i) => row(i)), error: null },
      { data: [row(1000), row(1001)], error: null },
    ];
    const source = await getPlanningSource(SUPABASE_MODE);

    const tasks = await source.getWorkspaceTasks(["p1"]);

    expect(tasks).toHaveLength(1002);
    expect(supabaseRef.calls).toHaveLength(3);
    for (const call of supabaseRef.calls) {
      expect(call.filters).toEqual(expect.arrayContaining(["order:created_at", "order:id", "limit:1000"]));
    }
    expect(supabaseRef.calls.map((call) => call.filters.find((f) => f.startsWith("or:")))).toEqual([
      undefined,
      'or:created_at.gt."2026-11-01T00:00:00.000Z",and(created_at.eq."2026-11-01T00:00:00.000Z",id.gt.t0999)',
      'or:created_at.gt."2026-11-01T00:00:00.000Z",and(created_at.eq."2026-11-01T00:00:00.000Z",id.gt.t1001)',
    ]);
  });
});
