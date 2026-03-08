import { describe, expect, it } from "vitest";
import { shapeProcurementItemsWithOrderContext } from "@/data/procurement-source";

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
        lockedFromEstimate: false,
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
});
