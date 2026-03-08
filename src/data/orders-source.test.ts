import { describe, expect, it } from "vitest";
import { shapeOrdersWithDetails } from "@/data/orders-source";

function orderRow(
  overrides: Partial<Parameters<typeof shapeOrdersWithDetails>[0]["orderRows"][number]> = {},
) {
  return {
    id: "order-stock",
    project_id: "project-1",
    supplier_name: "Warehouse",
    supplier_contact: null,
    status: "partially_received" as const,
    ordered_at: "2026-03-02T00:00:00.000Z",
    delivery_due_at: "2026-03-05T00:00:00.000Z",
    created_by: "profile-1",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-03T00:00:00.000Z",
    ...overrides,
  };
}

function lineRow(
  overrides: Partial<Parameters<typeof shapeOrdersWithDetails>[0]["lineRows"][number]> = {},
) {
  return {
    id: "line-stock",
    order_id: "order-stock",
    procurement_item_id: "proc-1",
    title: "Copper cable",
    quantity: 5,
    unit: "m",
    unit_price_cents: 1500,
    total_price_cents: 7500,
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function movementRow(
  overrides: Partial<Parameters<typeof shapeOrdersWithDetails>[0]["movementRows"][number]> = {},
) {
  return {
    id: "movement-1",
    project_id: "project-1",
    inventory_item_id: "inventory-item-1",
    inventory_location_id: "location-a",
    order_line_id: "line-stock",
    procurement_item_id: "proc-1",
    movement_type: "transfer" as const,
    delta_qty: -2,
    notes: null,
    created_by: "profile-1",
    created_at: "2026-03-03T01:00:00.000Z",
    ...overrides,
  };
}

function procurementItemRow(
  overrides: Partial<Parameters<typeof shapeOrdersWithDetails>[0]["procurementItemRows"][number]> = {},
) {
  return {
    id: "proc-1",
    project_id: "project-1",
    estimate_resource_line_id: null,
    task_id: null,
    title: "Copper cable",
    description: null,
    category: null,
    quantity: 12,
    unit: "m",
    planned_unit_price_cents: 1200,
    planned_total_price_cents: 14400,
    status: "ordered" as const,
    created_by: "profile-1",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("orders-source helpers", () => {
  it("shapes orders, lines, and receive events with conservative compatibility rules", () => {
    const orders = shapeOrdersWithDetails({
      orderRows: [
        orderRow(),
        orderRow({
          id: "order-draft",
          status: "draft",
          supplier_name: "Draft Supplier",
          updated_at: "2026-03-02T00:00:00.000Z",
        }),
        orderRow({
          id: "order-void",
          status: "cancelled",
          supplier_name: "Cancelled Supplier",
          updated_at: "2026-03-01T12:00:00.000Z",
        }),
        orderRow({
          id: "order-supplier",
          status: "received",
          supplier_name: "BuildMart",
          updated_at: "2026-03-04T00:00:00.000Z",
        }),
      ],
      lineRows: [
        lineRow(),
        lineRow({
          id: "line-supplier",
          order_id: "order-supplier",
          procurement_item_id: "proc-2",
          title: "Drywall screws",
          quantity: 4,
          unit: null,
          unit_price_cents: 900,
        }),
      ],
      movementRows: [
        movementRow(),
        movementRow({
          id: "movement-2",
          inventory_location_id: "location-b",
          delta_qty: 2,
          created_at: "2026-03-03T01:00:00.000Z",
        }),
        movementRow({
          id: "movement-3",
          inventory_location_id: "location-b",
          movement_type: "issue",
          delta_qty: -1,
          created_at: "2026-03-03T02:00:00.000Z",
          notes: "Installed",
        }),
        movementRow({
          id: "movement-4",
          order_line_id: "line-supplier",
          procurement_item_id: "proc-2",
          inventory_location_id: "site",
          movement_type: "receipt",
          delta_qty: 4,
          created_at: "2026-03-04T01:00:00.000Z",
        }),
      ],
      procurementItemRows: [
        procurementItemRow(),
        procurementItemRow({
          id: "proc-2",
          title: "Drywall screws",
          unit: "pcs",
          planned_unit_price_cents: 800,
        }),
      ],
    });

    expect(orders).toHaveLength(4);

    const supplierOrder = orders.find((order) => order.id === "order-supplier");
    expect(supplierOrder).toEqual({
      id: "order-supplier",
      projectId: "project-1",
      status: "received",
      kind: "supplier",
      supplierName: "BuildMart",
      deliverToLocationId: "site",
      fromLocationId: null,
      toLocationId: null,
      dueDate: null,
      deliveryDeadline: "2026-03-05T00:00:00.000Z",
      invoiceAttachment: null,
      note: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-04T00:00:00.000Z",
      lines: [
        {
          id: "line-supplier",
          orderId: "order-supplier",
          procurementItemId: "proc-2",
          qty: 4,
          receivedQty: 4,
          unit: "pcs",
          plannedUnitPrice: 8,
          actualUnitPrice: 9,
        },
      ],
      receiveEvents: [
        {
          id: "movement-4",
          orderId: "order-supplier",
          orderLineId: "line-supplier",
          procurementItemId: "proc-2",
          locationId: "site",
          deltaQty: 4,
          eventType: "receive",
          sourceLocationId: undefined,
          note: null,
          createdAt: "2026-03-04T01:00:00.000Z",
        },
      ],
    });

    const stockOrder = orders.find((order) => order.id === "order-stock");
    expect(stockOrder).toEqual({
      id: "order-stock",
      projectId: "project-1",
      status: "placed",
      kind: "stock",
      supplierName: "Warehouse",
      deliverToLocationId: "location-b",
      fromLocationId: "location-a",
      toLocationId: "location-b",
      dueDate: null,
      deliveryDeadline: "2026-03-05T00:00:00.000Z",
      invoiceAttachment: null,
      note: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-03T00:00:00.000Z",
      lines: [
        {
          id: "line-stock",
          orderId: "order-stock",
          procurementItemId: "proc-1",
          qty: 5,
          receivedQty: 2,
          unit: "m",
          plannedUnitPrice: 12,
          actualUnitPrice: 15,
        },
      ],
      receiveEvents: [
        {
          id: "movement-1",
          orderId: "order-stock",
          orderLineId: "line-stock",
          procurementItemId: "proc-1",
          locationId: "location-a",
          deltaQty: -2,
          eventType: "move_out",
          sourceLocationId: "location-b",
          note: null,
          createdAt: "2026-03-03T01:00:00.000Z",
        },
        {
          id: "movement-2",
          orderId: "order-stock",
          orderLineId: "line-stock",
          procurementItemId: "proc-1",
          locationId: "location-b",
          deltaQty: 2,
          eventType: "move_in",
          sourceLocationId: "location-a",
          note: null,
          createdAt: "2026-03-03T01:00:00.000Z",
        },
        {
          id: "movement-3",
          orderId: "order-stock",
          orderLineId: "line-stock",
          procurementItemId: "proc-1",
          locationId: "location-b",
          deltaQty: -1,
          eventType: "use",
          sourceLocationId: undefined,
          note: "Installed",
          createdAt: "2026-03-03T02:00:00.000Z",
        },
      ],
    });

    expect(orders.find((order) => order.id === "order-draft")?.status).toBe("draft");
    expect(orders.find((order) => order.id === "order-void")?.status).toBe("voided");
  });
});
