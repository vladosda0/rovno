import { describe, expect, it } from "vitest";
import { addProcurementItem } from "@/data/procurement-store";
import {
  computeFulfilledQty,
  computeInStockByLocation,
  computeOrderedOpenQty,
  computeRemainingRequestedQty,
} from "@/lib/procurement-fulfillment";
import type { InventoryLocation, OrderWithLines } from "@/types/entities";

function addTestRequestLine(projectId: string, id: string, requiredQty = 10) {
  return addProcurementItem({
    id,
    projectId,
    stageId: null,
    categoryId: null,
    type: "material",
    name: `Item ${id}`,
    spec: "Spec",
    unit: "pcs",
    requiredByDate: null,
    requiredQty,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 100,
    actualUnitPrice: 120,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: false,
    linkUrl: null,
    notes: null,
    attachments: [],
    createdFrom: "manual",
    linkedTaskIds: [],
    archived: false,
  });
}

describe("procurement fulfillment utils", () => {
  it("computes remaining qty with split supplier + stock fulfillments", () => {
    const projectId = `test-project-${Date.now()}`;
    const item = addTestRequestLine(projectId, `req-${Date.now()}`, 10);

    const orders: OrderWithLines[] = [
      {
        id: "o-1",
        projectId,
        status: "placed",
        kind: "supplier",
        supplierName: "Supplier A",
        deliverToLocationId: "loc-site",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "l-1",
            orderId: "o-1",
            procurementItemId: item.id,
            qty: 3,
            receivedQty: 1,
            unit: "pcs",
            plannedUnitPrice: 100,
            actualUnitPrice: 120,
          },
        ],
      },
      {
        id: "o-2",
        projectId,
        status: "received",
        kind: "stock",
        fromLocationId: "loc-a",
        toLocationId: "loc-site",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "l-2",
            orderId: "o-2",
            procurementItemId: item.id,
            qty: 4,
            receivedQty: 4,
            unit: "pcs",
            plannedUnitPrice: 100,
            actualUnitPrice: 120,
          },
        ],
      },
    ];

    expect(computeRemainingRequestedQty(item.id, orders)).toBe(3);
    expect(computeOrderedOpenQty(item.id, orders)).toBe(2);
    expect(computeFulfilledQty(item.id, orders)).toBe(7);
  });

  it("builds in-stock groups only from location placements", () => {
    const projectId = `stock-project-${Date.now()}`;
    const item = addTestRequestLine(projectId, `req-stock-${Date.now()}`, 10);

    const orders: OrderWithLines[] = [
      {
        id: "supplier-received",
        projectId,
        status: "received",
        kind: "supplier",
        deliverToLocationId: "loc-site",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "line-a",
            orderId: "supplier-received",
            procurementItemId: item.id,
            qty: 5,
            receivedQty: 5,
            unit: "pcs",
            plannedUnitPrice: 100,
            actualUnitPrice: 120,
          },
        ],
      },
      {
        id: "stock-move",
        projectId,
        status: "received",
        kind: "stock",
        fromLocationId: "loc-site",
        toLocationId: "loc-wh",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "line-b",
            orderId: "stock-move",
            procurementItemId: item.id,
            qty: 2,
            receivedQty: 2,
            unit: "pcs",
            plannedUnitPrice: 100,
            actualUnitPrice: 120,
          },
        ],
      },
    ];

    const locations: InventoryLocation[] = [
      { id: "loc-site", name: "To the site", isDefault: true },
      { id: "loc-wh", name: "Warehouse" },
    ];

    const groups = computeInStockByLocation(projectId, [item], orders, locations);
    expect(groups.length).toBe(2);

    const byLocation = new Map(groups.map((group) => [group.locationId, group]));
    expect(byLocation.get("loc-site")?.items[0]?.qty).toBe(3);
    expect(byLocation.get("loc-wh")?.items[0]?.qty).toBe(2);
  });
});
