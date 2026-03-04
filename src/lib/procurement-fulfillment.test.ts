import { describe, expect, it } from "vitest";
import { addProcurementItem } from "@/data/procurement-store";
import {
  computeTabChipTotals,
  computeFulfilledQty,
  computeInStockByLocation,
  computeOrderedOpenQty,
  computeRemainingRequestedQty,
  isEstimateLinkedProcurementItem,
} from "@/lib/procurement-fulfillment";
import type { InventoryLocation, OrderWithLines, ProcurementItemV2 } from "@/types/entities";

function addTestRequestLine(
  projectId: string,
  id: string,
  requiredQty = 10,
  overrides: Partial<ProcurementItemV2> = {},
) {
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
    sourceEstimateItemId: null,
    sourceEstimateV2LineId: null,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    linkUrl: null,
    notes: null,
    attachments: [],
    createdFrom: "manual",
    linkedTaskIds: [],
    archived: false,
    ...overrides,
  });
}

describe("procurement fulfillment utils", () => {
  it("detects estimate-linked procurement requests by active linkage keys", () => {
    expect(isEstimateLinkedProcurementItem({
      sourceEstimateV2LineId: "line-1",
      sourceEstimateItemId: null,
    } as ProcurementItemV2)).toBe(true);
    expect(isEstimateLinkedProcurementItem({
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: "legacy-1",
    } as ProcurementItemV2)).toBe(true);
    expect(isEstimateLinkedProcurementItem({
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: null,
    } as ProcurementItemV2)).toBe(false);
  });

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
      {
        id: "o-voided",
        projectId,
        status: "voided",
        kind: "supplier",
        supplierName: "Supplier B",
        deliverToLocationId: "loc-site",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "l-voided",
            orderId: "o-voided",
            procurementItemId: item.id,
            qty: 2,
            receivedQty: 0,
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

  it("clamps requested remaining to zero when ordered quantity exceeds requested", () => {
    const projectId = `remaining-clamp-${Date.now()}`;
    const item = addTestRequestLine(projectId, `req-over-${Date.now()}`, 5);
    const orders: OrderWithLines[] = [
      {
        id: "o-over",
        projectId,
        status: "placed",
        kind: "supplier",
        supplierName: "Supplier X",
        deliverToLocationId: "loc-site",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "l-over",
            orderId: "o-over",
            procurementItemId: item.id,
            qty: 7,
            receivedQty: 0,
            unit: "pcs",
            plannedUnitPrice: 100,
            actualUnitPrice: 120,
          },
        ],
      },
    ];

    expect(computeRemainingRequestedQty(item.id, orders)).toBe(0);
  });

  it("excludes non-estimate-linked items from requested chip totals", () => {
    const projectId = `chip-filter-${Date.now()}`;
    const linked = addTestRequestLine(projectId, `linked-${Date.now()}`, 4, {
      sourceEstimateV2LineId: "line-linked",
      createdFrom: "estimate",
      plannedUnitPrice: 250,
    });
    const manual = addTestRequestLine(projectId, `manual-${Date.now()}`, 6, {
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: null,
      createdFrom: "manual",
      plannedUnitPrice: 999,
    });

    const totals = computeTabChipTotals(projectId, [linked, manual], [], []);

    expect(totals.requested.count).toBe(1);
    expect(totals.requested.total).toBe(1_000);
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
        receiveEvents: [
          {
            id: "ev-a",
            orderId: "supplier-received",
            orderLineId: "line-a",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: 3,
            eventType: "receive",
            createdAt: new Date().toISOString(),
          },
          {
            id: "ev-b",
            orderId: "supplier-received",
            orderLineId: "line-a",
            procurementItemId: item.id,
            locationId: "loc-wh",
            deltaQty: 2,
            eventType: "receive",
            createdAt: new Date().toISOString(),
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
        receiveEvents: [
          {
            id: "ev-c",
            orderId: "stock-move",
            orderLineId: "line-b",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: -2,
            eventType: "move_out",
            createdAt: new Date().toISOString(),
          },
          {
            id: "ev-d",
            orderId: "stock-move",
            orderLineId: "line-b",
            procurementItemId: item.id,
            locationId: "loc-wh",
            deltaQty: 2,
            eventType: "move_in",
            createdAt: new Date().toISOString(),
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
    expect(byLocation.get("loc-site")?.items[0]?.qty).toBe(1);
    expect(byLocation.get("loc-wh")?.items[0]?.qty).toBe(4);
  });
});
