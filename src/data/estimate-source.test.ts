import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../backend-truth/generated/supabase-types";
import {
  EstimateDraftConflictError,
  ensureProjectEstimateRoot,
  parseEstimateOperationalSummaryPayload,
  saveCurrentEstimateDraft,
} from "@/data/estimate-source";
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
  /** When set, every WRITE operation is recorded as "action:table[:tag]". */
  log?: string[];
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

  private recordWrite(): void {
    if (!this.database.log || !this.action || this.action === "select") {
      return;
    }
    let tag = "";
    if (this.action === "update" && this.table === "project_estimates") {
      const payload = this.payload as Record<string, unknown> | null;
      tag = payload && "draft_seq" in payload ? ":draft_seq" : ":content";
    }
    this.database.log.push(`${this.action}:${this.table}${tag}`);
  }

  private async execute(): Promise<{ data: unknown; error: Error | null }> {
    this.recordWrite();
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
      const matched = applyFilters(rows, this.filters);
      matched.forEach((row) => {
        Object.assign(row, this.payload as Record<string, unknown>);
      });
      // Honor .select() after .update() — the draft-save CAS tail counts the
      // returned rows to detect a lost compare-and-set.
      return {
        data: this.shouldReturnRows
          ? (this.shouldReturnSingleRow ? (matched[0] ?? null) : matched)
          : null,
        error: null,
      };
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
    // Pre-P1 database shape: the RPCs are absent, so callers take their legacy
    // fallback paths (which these suites pin). RPC-path behavior is covered by
    // the estimate-v2-store suites and the pgTAP parity suite in rovno-db.
    async rpc(functionName: string) {
      return {
        data: null,
        error: {
          code: "PGRST202",
          message: `Could not find the function public.${functionName} in the schema cache`,
        },
      };
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
            execution_status: null,
            draft_seq: 0,
            projection_revision: null,
            projection_seq: 0,
            projection_synced_at: null,
            projection_actor: null,
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
            client_vat_bps: null,
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
            system_stage_article_id: null,
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
            planned_start: null,
            planned_end: null,
            system_work_article_id: null,
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        estimate_resource_lines: [],
        estimate_dependencies: [],
      },
    };
  });

  const buildSingleWorkSnapshot = (): EstimateV2Snapshot => ({
    project: {
      id: "project-remote-1",
      projectId: "project-remote-1",
      title: "Remote Project",
      projectMode: "contractor",
      currency: "RUB",
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
    ],
    lines: [],
    dependencies: [],
  });

  it("acquires the draft CAS before any content write", async () => {
    const database = mockDatabaseRef.current!;
    database.log = [];

    await expect(
      saveCurrentEstimateDraft("project-remote-1", buildSingleWorkSnapshot(), {
        profileId: "profile-1",
        expectedDraftSeq: 0,
      }),
    ).resolves.toBeUndefined();

    const log = database.log;
    const casIndex = log.indexOf("update:project_estimates:draft_seq");
    const firstContentWrite = log.findIndex((op) => op !== "update:project_estimates:draft_seq"
      && /^(insert|upsert|update|delete):(project_estimates|project_stages|estimate_works|estimate_resource_lines|estimate_dependencies)/.test(op));
    expect(casIndex).toBeGreaterThanOrEqual(0);
    expect(firstContentWrite).toBeGreaterThan(casIndex);
    expect(database.tables.project_estimates[0]?.draft_seq).toBe(1);
  });

  it("invokes onDraftSeqAcquired exactly when the CAS row advances", async () => {
    const acquired: number[] = [];

    await expect(
      saveCurrentEstimateDraft("project-remote-1", buildSingleWorkSnapshot(), {
        profileId: "profile-1",
        expectedDraftSeq: 0,
        onDraftSeqAcquired: (nextSeq) => acquired.push(nextSeq),
      }),
    ).resolves.toBeUndefined();

    expect(acquired).toEqual([1]);
  });

  it("never invokes onDraftSeqAcquired on a pre-acquire abort (baseline must not advance)", async () => {
    const acquired: number[] = [];
    const database = mockDatabaseRef.current!;
    database.log = [];

    await expect(
      saveCurrentEstimateDraft("project-remote-1", buildSingleWorkSnapshot(), {
        profileId: "profile-1",
        expectedDraftSeq: 0,
        shouldAbort: () => true,
        onDraftSeqAcquired: (nextSeq) => acquired.push(nextSeq),
      }),
    ).resolves.toBeUndefined();

    expect(acquired).toEqual([]);
    expect(database.log).toEqual([]);
    expect(database.tables.project_estimates[0]?.draft_seq).toBe(0);
  });

  it("never invokes onDraftSeqAcquired when the CAS loses", async () => {
    const acquired: number[] = [];
    const database = mockDatabaseRef.current!;
    (database.tables.project_estimates[0] as Record<string, unknown>).draft_seq = 5;

    await expect(
      saveCurrentEstimateDraft("project-remote-1", buildSingleWorkSnapshot(), {
        profileId: "profile-1",
        expectedDraftSeq: 4,
        onDraftSeqAcquired: (nextSeq) => acquired.push(nextSeq),
      }),
    ).rejects.toBeInstanceOf(EstimateDraftConflictError);

    expect(acquired).toEqual([]);
  });

  it("loses the CAS with zero content writes when based on a stale hydrate", async () => {
    const database = mockDatabaseRef.current!;
    // The server moved to seq 5 after this session hydrated at seq 4; the
    // stale save must conflict BEFORE overwriting or pruning anything —
    // non-overlapping saves are exactly the case a save-start read misses.
    (database.tables.project_estimates[0] as Record<string, unknown>).draft_seq = 5;
    database.log = [];
    const worksBefore = database.tables.estimate_works.map((row) => ({ ...row }));

    await expect(
      saveCurrentEstimateDraft("project-remote-1", buildSingleWorkSnapshot(), {
        profileId: "profile-1",
        expectedDraftSeq: 4,
      }),
    ).rejects.toBeInstanceOf(EstimateDraftConflictError);

    const contentWrites = database.log.filter((op) => op !== "update:project_estimates:draft_seq");
    expect(contentWrites).toEqual([]);
    expect(database.tables.estimate_works).toEqual(worksBefore);
    expect(database.tables.project_estimates[0]?.draft_seq).toBe(5);
  });

  it("reuses the existing current version id when saving a second work", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
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

  it("does not delete existing rows when snapshot is empty but draft has structure", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
        taxBps: 2000,
        discountBps: 0,
        markupBps: 0,
        estimateStatus: "planning",
        receivedCents: 0,
        pnlPlaceholderCents: 0,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
      stages: [],
      works: [],
      lines: [],
      dependencies: [],
    };

    await expect(
      saveCurrentEstimateDraft("project-remote-1", snapshot, { profileId: "profile-1" }),
    ).resolves.toBeUndefined();

    const database = mockDatabaseRef.current;
    expect(database?.tables.project_stages).toHaveLength(1);
    expect(database?.tables.estimate_works).toHaveLength(1);
  });

  it("does not delete existing rows when allowPrune is false", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
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
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          projectId: "project-remote-1",
          title: "New Stage",
          order: 1,
          discountBps: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
      works: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          projectId: "project-remote-1",
          stageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "New Work",
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
      lines: [],
      dependencies: [],
    };

    await expect(
      saveCurrentEstimateDraft("project-remote-1", snapshot, {
        profileId: "profile-1",
        allowPrune: false,
      }),
    ).resolves.toBeUndefined();

    const database = mockDatabaseRef.current;
    expect(database?.tables.project_stages).toHaveLength(2);
    expect(database?.tables.estimate_works).toHaveLength(2);
    expect(database?.tables.project_stages.map((s) => s.title)).toEqual(
      expect.arrayContaining(["Shell", "New Stage"]),
    );
    expect(database?.tables.estimate_works.map((w) => w.title)).toEqual(
      expect.arrayContaining(["Framing", "New Work"]),
    );
  });

  it("aborts before stale line writes when a newer revision lands mid-save", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
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

  it("does not prune lines when snapshot has works but zero lines and DB has lines", async () => {
    mockDatabaseRef.current!.tables.estimate_resource_lines = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        estimate_work_id: "44444444-4444-4444-8444-444444444444",
        resource_type: "labor",
        title: "Crew",
        quantity: 2,
        unit: "day",
        unit_price_cents: 15000,
        total_price_cents: 30000,
        client_unit_price_cents: 15000,
        client_total_price_cents: 30000,
        markup_bps: 500,
        discount_bps_override: 200,
        created_at: "2026-03-01T00:00:00.000Z",
      } as Database["public"]["Tables"]["estimate_resource_lines"]["Row"],
    ];

    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
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
      ],
      lines: [],
      dependencies: [],
    };

    await saveCurrentEstimateDraft("project-remote-1", snapshot, {
      profileId: "profile-1",
      allowPrune: true,
    });

    const database = mockDatabaseRef.current;
    expect(database?.tables.estimate_resource_lines).toHaveLength(1);
    expect(database?.tables.estimate_resource_lines[0]?.markup_bps).toBe(500);
    expect(database?.tables.estimate_resource_lines[0]?.discount_bps_override).toBe(200);
  });

  it("prunes lines normally when snapshot includes both works and lines", async () => {
    mockDatabaseRef.current!.tables.estimate_resource_lines = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        estimate_work_id: "44444444-4444-4444-8444-444444444444",
        resource_type: "labor",
        title: "Old Crew",
        quantity: 2,
        unit: "day",
        unit_price_cents: 15000,
        total_price_cents: 30000,
        client_unit_price_cents: 15000,
        client_total_price_cents: 30000,
        markup_bps: 0,
        discount_bps_override: null,
        created_at: "2026-03-01T00:00:00.000Z",
      } as Database["public"]["Tables"]["estimate_resource_lines"]["Row"],
    ];

    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
        taxBps: 2000,
        discountBps: 0,
        markupBps: 500,
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
      ],
      lines: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          workId: "44444444-4444-4444-8444-444444444444",
          title: "New Crew",
          type: "labor",
          unit: "day",
          qtyMilli: 3000,
          costUnitCents: 20000,
          markupBps: 500,
          discountBpsOverride: 100,
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

    await saveCurrentEstimateDraft("project-remote-1", snapshot, {
      profileId: "profile-1",
      allowPrune: true,
    });

    const database = mockDatabaseRef.current;
    expect(database?.tables.estimate_resource_lines).toHaveLength(1);
    expect(database?.tables.estimate_resource_lines[0]?.title).toBe("New Crew");
    expect(database?.tables.estimate_resource_lines[0]?.markup_bps).toBe(500);
    expect(database?.tables.estimate_resource_lines[0]?.discount_bps_override).toBe(100);
  });

  it("persists assignee_profile_id on resource line upserts when snapshot line has assigneeId", async () => {
    const assigneeUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
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
      ],
      lines: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          workId: "44444444-4444-4444-8444-444444444444",
          title: "Crew",
          type: "labor",
          unit: "day",
          qtyMilli: 2000,
          costUnitCents: 15000,
          markupBps: 0,
          discountBpsOverride: null,
          assigneeId: assigneeUuid,
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

    await saveCurrentEstimateDraft("project-remote-1", snapshot, { profileId: "profile-1" });

    const row = mockDatabaseRef.current?.tables.estimate_resource_lines[0] as Record<string, unknown> | undefined;
    expect(row?.assignee_profile_id).toBe(assigneeUuid);
  });

  it("persists assignee_label when snapshot line has free-text assigneeName without assigneeId", async () => {
    const snapshot: EstimateV2Snapshot = {
      project: {
        id: "project-remote-1",
        projectId: "project-remote-1",
        title: "Remote Project",
        projectMode: "contractor",
        currency: "RUB",
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
      ],
      lines: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          projectId: "project-remote-1",
          stageId: "33333333-3333-4333-8333-333333333333",
          workId: "44444444-4444-4444-8444-444444444444",
          title: "Crew",
          type: "labor",
          unit: "day",
          qtyMilli: 2000,
          costUnitCents: 15000,
          markupBps: 0,
          discountBpsOverride: null,
          assigneeId: null,
          assigneeName: "Володя",
          assigneeEmail: null,
          receivedCents: 0,
          pnlPlaceholderCents: 0,
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
      dependencies: [],
    };

    await saveCurrentEstimateDraft("project-remote-1", snapshot, { profileId: "profile-1" });

    const row = mockDatabaseRef.current?.tables.estimate_resource_lines[0] as Record<string, unknown> | undefined;
    expect(row?.assignee_profile_id).toBeNull();
    expect(row?.assignee_label).toBe("Володя");
  });
});

describe("ensureProjectEstimateRoot creation race (23505)", () => {
  // Purpose-built stub: the pre-check select sees no root, the insert loses the
  // idx_project_estimates_project_id_unique race, the re-read sees the winner.
  function createRaceStub(winnerRow: Record<string, unknown>) {
    let selectCalls = 0;
    return {
      from(table: string) {
        expect(table).toBe("project_estimates");
        return {
          select() {
            return {
              eq() {
                selectCalls += 1;
                return Promise.resolve({
                  data: selectCalls === 1 ? [] : [winnerRow],
                  error: null,
                });
              },
            };
          },
          insert() {
            return {
              select() {
                return {
                  single: () => Promise.resolve({
                    data: null,
                    error: {
                      code: "23505",
                      message: 'duplicate key value violates unique constraint "idx_project_estimates_project_id_unique"',
                    },
                  }),
                };
              },
            };
          },
        };
      },
    } as unknown as Parameters<typeof ensureProjectEstimateRoot>[0];
  }

  it("adopts the winner when it carries this session's estimate id", async () => {
    const winner = { id: "estimate-1", project_id: "project-1", title: "Смета" };
    const result = await ensureProjectEstimateRoot(createRaceStub(winner), {
      projectId: "project-1",
      estimateId: "estimate-1",
      title: "Смета",
      createdBy: "profile-1",
    });
    expect(result).toEqual({ ok: true, row: winner });
  });

  it("raises the draft conflict when another session's root won", async () => {
    const winner = { id: "estimate-other", project_id: "project-1", title: "Смета" };
    await expect(ensureProjectEstimateRoot(createRaceStub(winner), {
      projectId: "project-1",
      estimateId: "estimate-1",
      title: "Смета",
      createdBy: "profile-1",
    })).rejects.toBeInstanceOf(EstimateDraftConflictError);
  });
});

describe("parseEstimateOperationalSummaryPayload", () => {
  it("parses assignee_display_name on resource lines", () => {
    const parsed = parseEstimateOperationalSummaryPayload({
      works: [],
      resource_lines: [
        {
          estimate_resource_line_id: "88888888-8888-4888-8888-888888888888",
          estimate_work_id: "44444444-4444-4444-8444-444444444444",
          estimate_work_title: "Framing",
          estimate_version_id: "77777777-7777-4777-8777-777777777777",
          project_stage_title: "Shell",
          resource_type: "labor",
          title: "Crew",
          quantity: 1,
          unit: "day",
          assignee_profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          assignee_display_name: "Shared assignee",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      upper_block: {
        effective_finance_visibility: "none",
        timing: {
          estimate_version_id: "77777777-7777-4777-8777-777777777777",
          estimate_version_number: 1,
          estimate_version_created_at: "2026-03-01T00:00:00.000Z",
        },
      },
    });

    expect(parsed?.resourceLines).toHaveLength(1);
    expect(parsed?.resourceLines[0]?.assignee_profile_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(parsed?.resourceLines[0]?.assignee_display_name).toBe("Shared assignee");
  });
});
