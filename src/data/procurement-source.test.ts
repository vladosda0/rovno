import { beforeEach, describe, expect, it, vi } from "vitest";

const PROCUREMENT_LINEAGE_SELECT = "id, estimate_resource_line_id, task_id, title, description, category, quantity, unit, planned_unit_price_cents, planned_total_price_cents, status, created_by";

type MockProcurementItemRow = {
  id: string;
  project_id: string;
  estimate_resource_line_id: string | null;
  task_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  planned_unit_price_cents: number | null;
  planned_total_price_cents: number | null;
  status: "requested" | "ordered" | "cancelled";
  created_by: string;
  created_at: string;
  updated_at: string;
};

const state = vi.hoisted(() => ({
  procurementRows: [] as MockProcurementItemRow[],
  upsertProcurementItemsMock: vi.fn(),
  unlinkProcurementItemsMock: vi.fn(),
  loadEstimateV2HeroTransitionCacheMock: vi.fn(),
  getLatestHeroTransitionEventMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table !== "procurement_items") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(selection: string) {
          if (selection !== PROCUREMENT_LINEAGE_SELECT) {
            throw new Error(`Unexpected procurement_items select: ${selection}`);
          }

          return {
            eq(field: string, projectId: string) {
              if (field !== "project_id") {
                throw new Error(`Unexpected eq field: ${field}`);
              }

              return {
                in(nextField: string, ids: string[]) {
                  if (nextField !== "estimate_resource_line_id") {
                    throw new Error(`Unexpected in field after eq: ${nextField}`);
                  }

                  return Promise.resolve({
                    data: state.procurementRows.filter((row) => (
                      row.project_id === projectId
                      && !!row.estimate_resource_line_id
                      && ids.includes(row.estimate_resource_line_id)
                    )),
                    error: null,
                  });
                },
                not(nextField: string, operator: string, value: null) {
                  if (
                    nextField !== "estimate_resource_line_id"
                    || operator !== "is"
                    || value !== null
                  ) {
                    throw new Error(`Unexpected not chain: ${nextField} ${operator}`);
                  }

                  return Promise.resolve({
                    data: state.procurementRows.filter((row) => (
                      row.project_id === projectId && row.estimate_resource_line_id != null
                    )),
                    error: null,
                  });
                },
              };
            },
            in(field: string, ids: string[]) {
              if (field !== "id") {
                throw new Error(`Unexpected in field: ${field}`);
              }

              return Promise.resolve({
                data: state.procurementRows.filter((row) => ids.includes(row.id)),
                error: null,
              });
            },
          };
        },
        upsert(rows: unknown, options: unknown) {
          state.upsertProcurementItemsMock(rows, options);
          return Promise.resolve({ error: null });
        },
        update(patch: unknown) {
          return {
            in(field: string, ids: string[]) {
              state.unlinkProcurementItemsMock(patch, field, ids);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/data/estimate-v2-transition-cache", () => ({
  loadEstimateV2HeroTransitionCache: state.loadEstimateV2HeroTransitionCacheMock,
}));

vi.mock("@/data/activity-source", () => ({
  getLatestHeroTransitionEvent: state.getLatestHeroTransitionEventMock,
}));

import {
  shapeProcurementItemsWithOrderContext,
  syncProjectProcurementFromEstimate,
} from "@/data/procurement-source";

function procurementItemRow(
  overrides: Partial<Parameters<typeof shapeProcurementItemsWithOrderContext>[0]["itemRows"][number]> = {},
) {
  return {
    id: "procurement-item-1",
    project_id: "project-1",
    estimate_resource_line_id: "estimate-line-1",
    task_id: null,
    title: "Copper cable",
    description: "NYM 3x2.5",
    category: "electrical",
    quantity: 12,
    unit: "m",
    planned_unit_price_cents: 1125,
    planned_total_price_cents: 13500,
    status: "ordered" as const,
    created_by: "profile-1",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    ...overrides,
  };
}

function orderRow(
  overrides: Partial<Parameters<typeof shapeProcurementItemsWithOrderContext>[0]["orderRows"][number]> = {},
) {
  return {
    id: "order-1",
    project_id: "project-1",
    supplier_name: "BuildMart",
    supplier_contact: null,
    status: "placed" as const,
    ordered_at: "2026-03-02T00:00:00.000Z",
    delivery_due_at: null,
    created_by: "profile-1",
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-03T00:00:00.000Z",
    ...overrides,
  };
}

function orderLineRow(
  overrides: Partial<Parameters<typeof shapeProcurementItemsWithOrderContext>[0]["orderLineRows"][number]> = {},
) {
  return {
    id: "order-line-1",
    order_id: "order-1",
    procurement_item_id: "procurement-item-1",
    title: "Copper cable",
    quantity: 7,
    unit: "m",
    unit_price_cents: 1350,
    total_price_cents: 9450,
    created_at: "2026-03-02T00:00:00.000Z",
    ...overrides,
  };
}

function movementRow(
  overrides: Partial<Parameters<typeof shapeProcurementItemsWithOrderContext>[0]["movementRows"][number]> = {},
) {
  return {
    id: "movement-1",
    project_id: "project-1",
    inventory_item_id: "inventory-item-1",
    inventory_location_id: "location-1",
    order_line_id: "order-line-1",
    procurement_item_id: "procurement-item-1",
    movement_type: "receipt" as const,
    delta_qty: 2,
    notes: null,
    created_by: "profile-1",
    created_at: "2026-03-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("procurement-source helpers", () => {
  beforeEach(() => {
    state.procurementRows = [];
    state.upsertProcurementItemsMock.mockReset();
    state.unlinkProcurementItemsMock.mockReset();
    state.loadEstimateV2HeroTransitionCacheMock.mockReset();
    state.getLatestHeroTransitionEventMock.mockReset();
    state.loadEstimateV2HeroTransitionCacheMock.mockReturnValue(null);
    state.getLatestHeroTransitionEventMock.mockResolvedValue(null);
  });

  it("maps procurement rows with derived order context and safe defaults", () => {
    const items = shapeProcurementItemsWithOrderContext({
      itemRows: [
        procurementItemRow(),
        procurementItemRow({
          id: "procurement-item-2",
          estimate_resource_line_id: null,
          task_id: "task-9",
          title: "Drywall screws",
          description: null,
          category: null,
          quantity: 50,
          unit: null,
          planned_unit_price_cents: null,
          planned_total_price_cents: null,
          status: "requested",
          created_at: "2026-03-04T00:00:00.000Z",
          updated_at: "2026-03-04T00:00:00.000Z",
        }),
        procurementItemRow({
          id: "procurement-item-3",
          title: "Cancelled row",
          status: "cancelled",
        }),
      ],
      orderRows: [
        orderRow(),
        orderRow({
          id: "order-2",
          status: "draft",
          supplier_name: "Draft Supplier",
          updated_at: "2026-03-04T00:00:00.000Z",
        }),
      ],
      orderLineRows: [
        orderLineRow(),
        orderLineRow({
          id: "order-line-2",
          order_id: "order-2",
          quantity: 9,
          unit_price_cents: 1450,
        }),
      ],
      movementRows: [
        movementRow(),
        movementRow({
          id: "movement-2",
          movement_type: "transfer",
          delta_qty: 1,
          created_at: "2026-03-03T01:00:00.000Z",
        }),
      ],
    });

    expect(items).toEqual([
      {
        id: "procurement-item-1",
        projectId: "project-1",
        stageId: null,
        categoryId: "electrical",
        type: "material",
        name: "Copper cable",
        spec: "NYM 3x2.5",
        unit: "m",
        requiredByDate: null,
        requiredQty: 12,
        orderedQty: 7,
        receivedQty: 3,
        plannedUnitPrice: 11.25,
        actualUnitPrice: 13.5,
        supplier: "BuildMart",
        supplierPreferred: null,
        locationPreferredId: null,
        lockedFromEstimate: true,
        sourceEstimateItemId: null,
        sourceEstimateV2LineId: "estimate-line-1",
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        linkUrl: null,
        notes: null,
        attachments: [],
        createdFrom: "estimate",
        linkedTaskIds: [],
        archived: false,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
      {
        id: "procurement-item-2",
        projectId: "project-1",
        stageId: null,
        categoryId: null,
        type: "material",
        name: "Drywall screws",
        spec: null,
        unit: "",
        requiredByDate: null,
        requiredQty: 50,
        orderedQty: 0,
        receivedQty: 0,
        plannedUnitPrice: null,
        actualUnitPrice: null,
        supplier: null,
        supplierPreferred: null,
        locationPreferredId: null,
        lockedFromEstimate: false,
        sourceEstimateItemId: null,
        sourceEstimateV2LineId: null,
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        linkUrl: null,
        notes: null,
        attachments: [],
        createdFrom: "task_material",
        linkedTaskIds: ["task-9"],
        archived: false,
        createdAt: "2026-03-04T00:00:00.000Z",
        updatedAt: "2026-03-04T00:00:00.000Z",
      },
    ]);
  });

  it("shapeProcurementItemsWithOrderContext maps linked estimate line resource_type to procurement type", () => {
    const items = shapeProcurementItemsWithOrderContext({
      itemRows: [
        procurementItemRow({
          id: "pi-tool",
          estimate_resource_line_id: "erl-tool",
          title: "Hammer",
        }),
      ],
      orderRows: [],
      orderLineRows: [],
      movementRows: [],
      estimateResourceLineTypeById: new Map([["erl-tool", "equipment"]]),
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("tool");
  });

  it("relinks a cached legacy tool row so repeated estimate updates keep the same persisted procurement item id", async () => {
    state.loadEstimateV2HeroTransitionCacheMock.mockReturnValue({
      version: 1,
      projectId: "project-1",
      fingerprint: "fingerprint-1",
      status: "completed",
      updatedAt: "2026-03-05T00:00:00.000Z",
      ids: {
        estimateId: "estimate-1",
        versionId: "version-1",
        eventId: "event-1",
        stageIdByLocalStageId: {},
        workIdByLocalWorkId: {},
        lineIdByLocalLineId: {
          "line-local-tool": "line-tool",
        },
        taskIdByLocalWorkId: {},
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {
          "line-local-tool": "proc-tool-legacy",
        },
        hrItemIdByLocalLineId: {},
      },
    });
    state.procurementRows = [
      procurementItemRow({
        id: "proc-tool-legacy",
        estimate_resource_line_id: null,
        task_id: "task-1",
        title: "Laser level v1",
        description: "Keep history",
        category: "tools",
        quantity: 1,
        unit: "day",
        planned_unit_price_cents: 3200,
        planned_total_price_cents: 3200,
        status: "ordered",
        created_by: "creator-1",
      }),
    ];

    await syncProjectProcurementFromEstimate({
      projectId: "project-1",
      estimateStatus: "in_work",
      works: [
        {
          id: "work-1",
          taskId: "task-1",
          plannedStart: "2026-03-10T00:00:00.000Z",
          stageId: "stage-1",
        },
      ],
      lines: [
        {
          id: "line-tool",
          stageId: "stage-1",
          workId: "work-1",
          title: "Laser level v2",
          type: "tool",
          qtyMilli: 1000,
          unit: "day",
          costUnitCents: 3200,
        },
      ],
      profileId: "profile-9",
    });

    expect(state.unlinkProcurementItemsMock).not.toHaveBeenCalled();
    expect(state.upsertProcurementItemsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "proc-tool-legacy",
          project_id: "project-1",
          estimate_resource_line_id: "line-tool",
          task_id: "task-1",
          title: "Laser level v2",
          status: "ordered",
          created_by: "creator-1",
        }),
      ],
      { onConflict: "id" },
    );
  });
});
