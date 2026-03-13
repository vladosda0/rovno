import { describe, expect, it } from "vitest";
import type { Database } from "../../backend-truth/generated/supabase-types";
import {
  createSupabaseInventorySource,
  mapInventoryBalanceRowsToStockRows,
  mapInventoryLocationRowToLocation,
} from "@/data/inventory-source";

type TableName = "inventory_locations" | "inventory_items" | "inventory_balances";

type MockDatabase = {
  nextId: number;
  tables: {
    [K in TableName]: Array<Database["public"]["Tables"][K]["Row"]>;
  };
};

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] };

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: Filter[]): T[] {
  return rows.filter((row) => filters.every((filter) => {
    if (filter.kind === "eq") {
      return row[filter.column] === filter.value;
    }
    return filter.value.includes(row[filter.column]);
  }));
}

function nextId(database: MockDatabase, prefix: string): string {
  database.nextId += 1;
  return `${prefix}-${database.nextId}`;
}

function hydrateInsertRow<TTable extends TableName>(
  database: MockDatabase,
  table: TTable,
  row: Record<string, unknown>,
): Database["public"]["Tables"][TTable]["Row"] {
  const timestamp = "2026-03-10T00:00:00.000Z";

  if (table === "inventory_locations") {
    return {
      id: typeof row.id === "string" ? row.id : nextId(database, "location"),
      project_id: String(row.project_id),
      title: String(row.title ?? ""),
      description: (row.description as string | null | undefined) ?? null,
      created_at: (row.created_at as string | undefined) ?? timestamp,
    } as Database["public"]["Tables"][TTable]["Row"];
  }

  if (table === "inventory_items") {
    return {
      id: typeof row.id === "string" ? row.id : nextId(database, "inventory-item"),
      project_id: String(row.project_id),
      title: String(row.title ?? ""),
      sku: (row.sku as string | null | undefined) ?? null,
      unit: String(row.unit ?? ""),
      notes: (row.notes as string | null | undefined) ?? null,
      created_at: (row.created_at as string | undefined) ?? timestamp,
      updated_at: (row.updated_at as string | undefined) ?? timestamp,
    } as Database["public"]["Tables"][TTable]["Row"];
  }

  return {
    id: typeof row.id === "string" ? row.id : nextId(database, "balance"),
    project_id: String(row.project_id),
    inventory_item_id: String(row.inventory_item_id),
    inventory_location_id: (row.inventory_location_id as string | null | undefined) ?? null,
    quantity: Number(row.quantity ?? 0),
    updated_at: (row.updated_at as string | undefined) ?? timestamp,
  } as Database["public"]["Tables"][TTable]["Row"];
}

class MockQueryBuilder<TTable extends TableName> implements PromiseLike<{ data: unknown; error: Error | null }> {
  private action: "select" | "insert" | null = null;

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
      const nextRows = (Array.isArray(this.payload) ? this.payload : [this.payload])
        .map((row) => hydrateInsertRow(this.database, this.table, row as Record<string, unknown>));
      rows.push(...nextRows);
      return {
        data: this.shouldReturnRows
          ? (this.shouldReturnSingleRow ? (nextRows[0] ?? null) : nextRows)
          : null,
        error: null,
      };
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

describe("inventory-source helpers", () => {
  it("maps inventory locations into the frontend contract with safe defaults", () => {
    expect(mapInventoryLocationRowToLocation({
      id: "location-1",
      project_id: "project-1",
      title: "Warehouse",
      description: null,
      created_at: "2026-03-01T00:00:00.000Z",
    })).toEqual({
      id: "location-1",
      name: "Warehouse",
      address: undefined,
      isDefault: false,
    });
  });

  it("maps backend balances and inventory items into stock rows", () => {
    expect(mapInventoryBalanceRowsToStockRows({
      balanceRows: [
        {
          id: "balance-1",
          project_id: "project-1",
          inventory_item_id: "inventory-item-1",
          inventory_location_id: "location-1",
          quantity: 7,
          updated_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "balance-2",
          project_id: "project-1",
          inventory_item_id: "inventory-item-2",
          inventory_location_id: null,
          quantity: 3,
          updated_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      inventoryItemRows: [
        {
          id: "inventory-item-1",
          project_id: "project-1",
          title: "Copper Cable",
          sku: null,
          unit: "m",
          notes: "3x2.5",
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    })).toEqual([
      {
        projectId: "project-1",
        locationId: "location-1",
        inventoryKey: "copper cable|3x2.5|m",
        qty: 7,
      },
    ]);
  });
});

describe("supabase inventory source", () => {
  it("creates locations and reads project stock from backend tables", async () => {
    const database: MockDatabase = {
      nextId: 0,
      tables: {
        inventory_locations: [],
        inventory_items: [
          {
            id: "inventory-item-1",
            project_id: "project-1",
            title: "Copper cable",
            sku: null,
            unit: "m",
            notes: "3x2.5",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        inventory_balances: [
          {
            id: "balance-1",
            project_id: "project-1",
            inventory_item_id: "inventory-item-1",
            inventory_location_id: "location-seed",
            quantity: 11,
            updated_at: "2026-03-02T00:00:00.000Z",
          },
        ],
      },
    };

    const source = createSupabaseInventorySource(
      createMockSupabase(database) as never,
    );

    const created = await source.createProjectLocation("project-1", {
      name: "Warehouse",
      address: "North yard",
    });

    expect(database.tables.inventory_locations).toEqual([
      expect.objectContaining({
        project_id: "project-1",
        title: "Warehouse",
        description: "North yard",
      }),
    ]);
    expect(created).toEqual({
      id: database.tables.inventory_locations[0].id,
      name: "Warehouse",
      address: "North yard",
      isDefault: false,
    });

    const stockRows = await source.getProjectStock("project-1");

    expect(stockRows).toEqual([
      {
        projectId: "project-1",
        locationId: "location-seed",
        inventoryKey: "copper cable|3x2.5|m",
        qty: 11,
      },
    ]);
  });
});
