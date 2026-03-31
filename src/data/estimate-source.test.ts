import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../backend-truth/generated/supabase-types";
import { saveCurrentEstimateDraft } from "@/data/estimate-source";
import type { EstimateV2Snapshot } from "@/types/estimate-v2";

type TableName =
  | "project_estimates"
  | "estimate_versions"
  | "project_stages"
  | "estimate_works"
  | "estimate_resource_lines"
  | "estimate_dependencies";

type MockDatabase = {
  tables: {
    [K in TableName]: Array<Database["public"]["Tables"][K]["Row"]>;
  };
};

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] };

const { mockDatabaseRef } = vi.hoisted(() => ({
  mockDatabaseRef: {
    current: null as MockDatabase | null,
  },
}));

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: Filter[]): T[] {
  return rows.filter((row) => filters.every((filter) => {
    if (filter.kind === "eq") {
      return row[filter.column] === filter.value;
    }
    return filter.value.includes(row[filter.column]);
  }));
}

class MockQueryBuilder<TTable extends TableName> implements PromiseLike<{ data: unknown; error: Error | null }> {
  private action: "select" | "insert" | "update" | "upsert" | "delete" | null = null;

  private filters: Filter[] = [];

  private payload: unknown = null;

  private orderConfig: { column: string; ascending: boolean } | null = null;

  private shouldReturnRows = false;

  private shouldReturnSingleRow = false;

  constructor(
    private readonly database: MockDatabase,
    private readonly table: TTable,
  ) {}

  select() {
    if (!this.action) {
      this.action = "select";
    }
    this.shouldReturnRows = true;
    return this;
  }

  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderConfig = {
      column,
      ascending: options?.ascending ?? true,
    };
    return this;
  }

  single() {
    this.shouldReturnSingleRow = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: Error | null }> {
    const rows = this.database.tables[this.table] as Array<Record<string, unknown>>;

    if (this.action === "select") {
      const filteredRows = applyFilters(rows, this.filters);
      const orderedRows = this.orderConfig
        ? [...filteredRows].sort((left, right) => {
          const leftValue = left[this.orderConfig!.column];
          const rightValue = right[this.orderConfig!.column];
          if (leftValue === rightValue) return 0;
          if (leftValue == null) return this.orderConfig!.ascending ? -1 : 1;
          if (rightValue == null) return this.orderConfig!.ascending ? 1 : -1;
          const comparison = leftValue < rightValue ? -1 : 1;
          return this.orderConfig!.ascending ? comparison : comparison * -1;
        })
        : filteredRows;

      return {
        data: this.shouldReturnSingleRow ? (orderedRows[0] ?? null) : orderedRows,
        error: null,
      };
    }

    if (this.action === "insert") {
      const insertedRows = (Array.isArray(this.payload) ? this.payload : [this.payload])
        .map((row) => ({ ...(row as Record<string, unknown>) }));
      rows.push(...insertedRows);
      return {
        data: this.shouldReturnRows
          ? (this.shouldReturnSingleRow ? (insertedRows[0] ?? null) : insertedRows)
          : null,
        error: null,
      };
    }

    if (this.action === "update") {
      applyFilters(rows, this.filters).forEach((row) => {
        Object.assign(row, this.payload as Record<string, unknown>);
      });
      return { data: null, error: null };
    }

    if (this.action === "upsert") {
      const nextRows = Array.isArray(this.payload) ? this.payload : [this.payload];
      nextRows.forEach((row) => {
        const record = row as Record<string, unknown>;
        const existingIndex = rows.findIndex((current) => current.id === record.id);
        if (existingIndex >= 0) {
          rows[existingIndex] = {
            ...rows[existingIndex],
            ...record,
          };
          return;
        }
        rows.push({ ...record });
      });
      return { data: null, error: null };
    }

    if (this.action === "delete") {
      const rowsToDelete = new Set(applyFilters(rows, this.filters));
      this.database.tables[this.table] = rows.filter((row) => !rowsToDelete.has(row)) as MockDatabase["tables"][TTable];
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }
}

function createMockSupabase(database: MockDatabase) {
  return {
    from<TTable extends TableName>(table: TTable) {
      return new MockQueryBuilder(database, table);
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    if (!mockDatabaseRef.current) {
      throw new Error("Mock Supabase database not configured");
    }
    return createMockSupabase(mockDatabaseRef.current);
  },
}));

describe("saveCurrentEstimateDraft", () => {
  beforeEach(() => {
    mockDatabaseRef.current = {
      tables: {
        project_estimates: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            project_id: "project-remote-1",
            title: "Existing estimate",
            description: null,
            status: "draft",
            created_by: "profile-1",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-02T00:00:00.000Z",
          },
        ],
        estimate_versions: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            estimate_id: "11111111-1111-4111-8111-111111111111",
            version_number: 1,
            is_current: true,
            created_by: "profile-1",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        project_stages: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            project_id: "project-remote-1",
            title: "Shell",
            description: "",
            sort_order: 1,
            status: "open",
            discount_bps: 0,
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-02T00:00:00.000Z",
          },
        ],
        estimate_works: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            estimate_version_id: "22222222-2222-4222-8222-222222222222",
            project_stage_id: "33333333-3333-4333-8333-333333333333",
            title: "Framing",
            description: null,
            sort_order: 1,
            planned_cost_cents: 0,
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        estimate_resource_lines: [],
        estimate_dependencies: [],
      },
    };
  });

  it("reuses the existing current version id when saving a second work", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
        regime: "contractor",
        taxBps: 2000,
        discountBps: 0,
        markupBps: 0,
        estimateStatus: "planning",
        receivedCents: 0,
        pnlPlaceholderCents: 0,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
      stages: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          projectId: "project-remote-1",
          title: "Shell",
          order: 1,
          discountBps: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          title: "Framing",
          order: 1,
          discountBps: 0,
          plannedStart: null,
          plannedEnd: null,
          taskId: null,
          status: "not_started",
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          title: "Roof",
          order: 2,
          discountBps: 0,
          plannedStart: null,
          plannedEnd: null,
          taskId: null,
          status: "not_started",
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
      lines: [],
      dependencies: [],
    };

    await expect(
      saveCurrentEstimateDraft("project-remote-1", snapshot, { profileId: "profile-1" }),
    ).resolves.toBeUndefined();

    const database = mockDatabaseRef.current;
    expect(database?.tables.project_estimates).toHaveLength(1);
    expect(database?.tables.project_estimates[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(database?.tables.estimate_versions).toHaveLength(1);
    expect(database?.tables.estimate_versions[0]?.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(database?.tables.estimate_works).toHaveLength(2);
    expect(database?.tables.estimate_works.map((work) => work.estimate_version_id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(database?.tables.estimate_works.map((work) => work.title)).toEqual(["Framing", "Roof"]);
  });

  it("aborts before stale line writes when a newer revision lands mid-save", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
        regime: "contractor",
        taxBps: 2000,
        discountBps: 0,
        markupBps: 0,
        estimateStatus: "in_work",
        receivedCents: 0,
        pnlPlaceholderCents: 0,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
      stages: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          projectId: "project-remote-1",
          title: "Shell",
          order: 1,
          discountBps: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          title: "Framing",
          order: 1,
          discountBps: 0,
          plannedStart: null,
          plannedEnd: null,
          taskId: null,
          status: "not_started",
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
      lines: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          workId: "44444444-4444-4444-8444-444444444444",
          title: "Laser level v2",
          type: "tool",
          unit: "day",
          qtyMilli: 1000,
          costUnitCents: 3200,
          markupBps: 0,
          discountBpsOverride: null,
          assigneeId: null,
          assigneeName: null,
          assigneeEmail: null,
          receivedCents: 0,
          pnlPlaceholderCents: 0,
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
      dependencies: [],
    };

    let checkCount = 0;

    await expect(
      saveCurrentEstimateDraft("project-remote-1", snapshot, {
        profileId: "profile-1",
        // Allow the existing stage/work mutations to run, then simulate a
        // newer revision landing right before estimate-resource-line writes.
        shouldAbort: () => {
          checkCount += 1;
          return checkCount >= 11;
        },
      }),
    ).resolves.toBeUndefined();

    const database = mockDatabaseRef.current;
    expect(database?.tables.project_estimates[0]?.title).toBe("Remote Project");
    expect(database?.tables.estimate_works).toHaveLength(1);
    expect(database?.tables.estimate_resource_lines).toHaveLength(0);
  });
});
