import { describe, expect, it } from "vitest";
import {
  computeLastReceivedAt,
  computeProcurementHeaderKpis,
  computeTabChipTotals,
  collectItemLocationEventHistory,
  computeFulfilledQty,
  computeInStockByLocation,
  computeOrderedOpenQty,
  computeRemainingRequestedQty,
  isEstimateLinkedProcurementItem,
} from "@/lib/procurement-fulfillment";
import type { InventoryLocation, OrderWithLines, ProcurementItemV2 } from "@/types/entities";

function buildTestRequestLine(
  projectId: string,
  id: string,
  requiredQty = 10,
  overrides: Partial<ProcurementItemV2> = {},
) {
  return {
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
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  } satisfies ProcurementItemV2;
}

describe("procurement fulfillment utils", () => {
  it("detects estimate-linked procurement requests by active v2 linkage only", () => {
    expect(isEstimateLinkedProcurementItem({
      sourceEstimateV2LineId: "line-1",
      sourceEstimateItemId: null,
    } as ProcurementItemV2)).toBe(true);
    expect(isEstimateLinkedProcurementItem({
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: "legacy-1",
    } as ProcurementItemV2)).toBe(false);
    expect(isEstimateLinkedProcurementItem({
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: null,
    } as ProcurementItemV2)).toBe(false);
  });

  it("computes remaining qty with split supplier + stock fulfillments", () => {
    const projectId = `test-project-${Date.now()}`;
    const item = buildTestRequestLine(projectId, `req-${Date.now()}`, 10);

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

    expect(computeRemainingRequestedQty(item, orders)).toBe(3);
    expect(computeOrderedOpenQty(item.id, orders)).toBe(2);
    expect(computeFulfilledQty(item.id, orders)).toBe(7);
  });

  it("clamps requested remaining to zero when ordered quantity exceeds requested", () => {
    const projectId = `remaining-clamp-${Date.now()}`;
    const item = buildTestRequestLine(projectId, `req-over-${Date.now()}`, 5);
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

    expect(computeRemainingRequestedQty(item, orders)).toBe(0);
  });

  it("excludes non-estimate-linked items from requested chip totals", () => {
    const projectId = `chip-filter-${Date.now()}`;
    const linked = buildTestRequestLine(projectId, `linked-${Date.now()}`, 4, {
      sourceEstimateV2LineId: "line-linked",
      createdFrom: "estimate",
      plannedUnitPrice: 250,
    });
    const manual = buildTestRequestLine(projectId, `manual-${Date.now()}`, 6, {
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: null,
      createdFrom: "manual",
      plannedUnitPrice: 999,
    });

    const totals = computeTabChipTotals(projectId, [linked, manual], [], []);

    expect(totals.requested.count).toBe(1);
    expect(totals.requested.total).toBe(1_000);
  });

  it("computes requested totals from the provided item array without relying on the local procurement store", () => {
    const projectId = `supabase-requested-${Date.now()}`;
    const requested = buildTestRequestLine(projectId, `requested-${Date.now()}`, 8, {
      sourceEstimateV2LineId: "line-requested",
      createdFrom: "estimate",
      plannedUnitPrice: 300,
    });

    const orders: OrderWithLines[] = [
      {
        id: "order-requested",
        projectId,
        status: "placed",
        kind: "supplier",
        supplierName: "Supplier A",
        deliverToLocationId: "loc-site",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lines: [
          {
            id: "line-requested",
            orderId: "order-requested",
            procurementItemId: requested.id,
            qty: 3,
            receivedQty: 0,
            unit: requested.unit,
            plannedUnitPrice: requested.plannedUnitPrice ?? 0,
            actualUnitPrice: requested.actualUnitPrice ?? 0,
          },
        ],
      },
    ];

    const totals = computeTabChipTotals(projectId, [requested], orders, []);

    expect(totals.requested.count).toBe(1);
    expect(totals.requested.total).toBe(1_500);
  });

  it("builds in-stock groups only from location placements", () => {
    const projectId = `stock-project-${Date.now()}`;
    const item = buildTestRequestLine(projectId, `req-stock-${Date.now()}`, 10);

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

  it("computes last received date from positive receipt events only", () => {
    const projectId = `last-received-${Date.now()}`;
    const item = buildTestRequestLine(projectId, `req-last-${Date.now()}`, 10);
    const older = "2026-01-10T10:00:00.000Z";
    const newer = "2026-02-15T12:00:00.000Z";
    const usage = "2026-03-01T09:00:00.000Z";

    const orders: OrderWithLines[] = [
      {
        id: "order-last",
        projectId,
        status: "received",
        kind: "supplier",
        deliverToLocationId: "loc-site",
        createdAt: older,
        updatedAt: usage,
        lines: [
          {
            id: "line-last",
            orderId: "order-last",
            procurementItemId: item.id,
            qty: 10,
            receivedQty: 10,
            unit: "pcs",
          },
        ],
        receiveEvents: [
          {
            id: "ev-receive-1",
            orderId: "order-last",
            orderLineId: "line-last",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: 4,
            eventType: "receive",
            createdAt: older,
          },
          {
            id: "ev-receive-2",
            orderId: "order-last",
            orderLineId: "line-last",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: 6,
            eventType: "receive",
            createdAt: newer,
          },
          {
            id: "ev-use",
            orderId: "order-last",
            orderLineId: "line-last",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: -2,
            eventType: "use",
            createdAt: usage,
          },
        ],
      },
    ];

    expect(computeLastReceivedAt(item.id, "loc-site", orders)).toBe(newer);
  });

  it("separates receipt and usage event history by item+location", () => {
    const projectId = `event-history-${Date.now()}`;
    const item = buildTestRequestLine(projectId, `req-history-${Date.now()}`, 8);
    const now = new Date().toISOString();
    const orders: OrderWithLines[] = [
      {
        id: "order-history",
        projectId,
        status: "received",
        kind: "supplier",
        deliverToLocationId: "loc-site",
        createdAt: now,
        updatedAt: now,
        lines: [
          {
            id: "line-history",
            orderId: "order-history",
            procurementItemId: item.id,
            qty: 8,
            receivedQty: 8,
            unit: "pcs",
          },
        ],
        receiveEvents: [
          {
            id: "ev-history-receive",
            orderId: "order-history",
            orderLineId: "line-history",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: 8,
            eventType: "receive",
            createdAt: now,
          },
          {
            id: "ev-history-use",
            orderId: "order-history",
            orderLineId: "line-history",
            procurementItemId: item.id,
            locationId: "loc-site",
            deltaQty: -3,
            eventType: "use",
            createdAt: now,
          },
        ],
      },
    ];

    const history = collectItemLocationEventHistory(item.id, "loc-site", orders);
    expect(history.receiptEvents).toHaveLength(1);
    expect(history.usageEvents).toHaveLength(1);
    expect(history.receiptEvents[0]?.event.id).toBe("ev-history-receive");
    expect(history.usageEvents[0]?.event.id).toBe("ev-history-use");
  });

  it("computes procurement header KPIs for estimate-linked items only", () => {
    const projectId = `header-kpi-${Date.now()}`;
    const linked = buildTestRequestLine(projectId, `req-linked-${Date.now()}`, 10, {
      sourceEstimateV2LineId: "line-linked",
      plannedUnitPrice: 100,
      actualUnitPrice: 120,
      createdFrom: "estimate",
    });
    const manual = buildTestRequestLine(projectId, `req-manual-${Date.now()}`, 20, {
      sourceEstimateV2LineId: null,
      sourceEstimateItemId: null,
      plannedUnitPrice: 900,
      actualUnitPrice: 950,
      createdFrom: "manual",
    });

    const now = new Date().toISOString();
    const orders: OrderWithLines[] = [
      {
        id: "order-kpi",
        projectId,
        status: "placed",
        kind: "supplier",
        supplierName: "Supplier",
        deliverToLocationId: "loc-site",
        createdAt: now,
        updatedAt: now,
        lines: [
          {
            id: "line-linked",
            orderId: "order-kpi",
            procurementItemId: linked.id,
            qty: 6,
            receivedQty: 2,
            unit: "pcs",
            plannedUnitPrice: 100,
            actualUnitPrice: 120,
          },
          {
            id: "line-manual",
            orderId: "order-kpi",
            procurementItemId: manual.id,
            qty: 10,
            receivedQty: 4,
            unit: "pcs",
            plannedUnitPrice: 900,
            actualUnitPrice: 950,
          },
        ],
      },
    ];

    const kpis = computeProcurementHeaderKpis(projectId, [linked, manual], orders);
    expect(kpis.hasLinkedItems).toBe(true);
    expect(kpis.missingPlannedPriceCount).toBe(0);
    expect(kpis.missingOrderPriceCount).toBe(0);
    expect(kpis.planned).toBe(1000);
    expect(kpis.committed).toBe(480);
    expect(kpis.received).toBe(240);
    expect(kpis.used).toBe(720);
    expect(kpis.variance).toBe(280);
  });

  it("returns graceful KPI nulls when planned/order prices are missing", () => {
    const projectId = `header-kpi-missing-${Date.now()}`;
    const linkedNoPlan = buildTestRequestLine(projectId, `req-linked-missing-plan-${Date.now()}`, 5, {
      sourceEstimateV2LineId: "line-missing-plan",
      plannedUnitPrice: null,
      actualUnitPrice: null,
      createdFrom: "estimate",
    });
    const linkedWithPlan = buildTestRequestLine(projectId, `req-linked-missing-order-${Date.now()}`, 8, {
      sourceEstimateV2LineId: "line-missing-order",
      plannedUnitPrice: 200,
      actualUnitPrice: null,
      createdFrom: "estimate",
    });

    const now = new Date().toISOString();
    const orders: OrderWithLines[] = [
      {
        id: "order-kpi-missing",
        projectId,
        status: "placed",
        kind: "supplier",
        supplierName: "Supplier",
        deliverToLocationId: "loc-site",
        createdAt: now,
        updatedAt: now,
        lines: [
          {
            id: "line-missing-order-price",
            orderId: "order-kpi-missing",
            procurementItemId: linkedWithPlan.id,
            qty: 3,
            receivedQty: 1,
            unit: "pcs",
            plannedUnitPrice: null,
            actualUnitPrice: null,
          },
        ],
      },
    ];

    const kpis = computeProcurementHeaderKpis(projectId, [linkedNoPlan, linkedWithPlan], orders);
    expect(kpis.hasLinkedItems).toBe(true);
    expect(kpis.missingPlannedPriceCount).toBe(1);
    expect(kpis.missingOrderPriceCount).toBe(0);
    expect(kpis.planned).toBeNull();
    expect(kpis.committed).toBe(400);
    expect(kpis.received).toBe(200);
    expect(kpis.used).toBe(600);
    expect(kpis.variance).toBeNull();
  });
});
