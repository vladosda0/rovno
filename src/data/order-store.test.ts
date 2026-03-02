import { beforeEach, describe, expect, it } from "vitest";
import { addProcurementItem, getProcurementItemById } from "@/data/procurement-store";
import {
  __unsafeResetOrdersForTests,
  createDraftOrder,
  getOrder,
  placeOrder,
  receiveOrder,
} from "@/data/order-store";
import {
  __unsafeResetInventoryForTests,
  adjustStock,
  createLocation,
  ensureDefaultLocation,
  getStock,
} from "@/data/inventory-store";
import { toInventoryKey } from "@/lib/procurement-fulfillment";

function createRequestLine(projectId: string, id: string, qty = 10) {
  return addProcurementItem({
    id,
    projectId,
    stageId: null,
    categoryId: null,
    type: "material",
    name: `Material ${id}`,
    spec: null,
    unit: "pcs",
    requiredByDate: null,
    requiredQty: qty,
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

describe("order-store", () => {
  beforeEach(() => {
    __unsafeResetOrdersForTests();
    __unsafeResetInventoryForTests();
  });

  it("placing supplier order does not mutate inventory stock", () => {
    const projectId = `supplier-project-${Date.now()}`;
    const item = createRequestLine(projectId, `line-${Date.now()}`);
    const site = ensureDefaultLocation(projectId);

    const draft = createDraftOrder({
      projectId,
      kind: "supplier",
      supplierName: "Supplier",
      deliverToLocationId: site.id,
      lines: [{ procurementItemId: item.id, qty: 5, unit: "pcs", plannedUnitPrice: 100, actualUnitPrice: 120 }],
    });

    const placed = placeOrder(draft.id);
    expect(placed.ok).toBe(true);
    if (placed.ok) {
      expect(placed.order.status).toBe("placed");
    }

    expect(getStock(projectId, site.id, toInventoryKey(item))).toBe(0);
  });

  it("placing stock order moves inventory and completes immediately", () => {
    const projectId = `stock-project-${Date.now()}`;
    const item = createRequestLine(projectId, `line-${Date.now()}`);
    const from = ensureDefaultLocation(projectId);
    const to = createLocation(projectId, { name: "Warehouse" });

    adjustStock(projectId, from.id, toInventoryKey(item), 10);

    const draft = createDraftOrder({
      projectId,
      kind: "stock",
      fromLocationId: from.id,
      toLocationId: to.id,
      deliverToLocationId: to.id,
      lines: [{ procurementItemId: item.id, qty: 4, unit: "pcs", plannedUnitPrice: 100, actualUnitPrice: 120 }],
    });

    const placed = placeOrder(draft.id);
    expect(placed.ok).toBe(true);
    if (placed.ok) {
      expect(placed.order.status).toBe("received");
    }

    expect(getStock(projectId, from.id, toInventoryKey(item))).toBe(6);
    expect(getStock(projectId, to.id, toInventoryKey(item))).toBe(4);
  });

  it("supports partial receive and closes order when fully received", () => {
    const projectId = `receive-project-${Date.now()}`;
    const item = createRequestLine(projectId, `line-${Date.now()}`);
    const site = ensureDefaultLocation(projectId);

    const draft = createDraftOrder({
      projectId,
      kind: "supplier",
      supplierName: "Supplier",
      deliverToLocationId: site.id,
      lines: [{ procurementItemId: item.id, qty: 8, unit: "pcs", plannedUnitPrice: 100, actualUnitPrice: 120 }],
    });

    const placed = placeOrder(draft.id);
    expect(placed.ok).toBe(true);

    const firstLineId = getOrder(draft.id)?.lines[0]?.id;
    expect(firstLineId).toBeTruthy();
    if (!firstLineId) return;

    const firstReceive = receiveOrder(draft.id, { locationId: site.id, lines: [{ lineId: firstLineId, qty: 3 }] });
    expect(firstReceive.ok).toBe(true);
    if (firstReceive.ok) {
      expect(firstReceive.order.status).toBe("placed");
      expect(firstReceive.order.lines[0]?.receivedQty).toBe(3);
    }
    expect(getStock(projectId, site.id, toInventoryKey(item))).toBe(3);

    const secondReceive = receiveOrder(draft.id, { locationId: site.id, lines: [{ lineId: firstLineId, qty: 5 }] });
    expect(secondReceive.ok).toBe(true);
    if (secondReceive.ok) {
      expect(secondReceive.order.status).toBe("received");
      expect(secondReceive.order.lines[0]?.receivedQty).toBe(8);
    }
    expect(getStock(projectId, site.id, toInventoryKey(item))).toBe(8);

    const mirroredRequest = getProcurementItemById(item.id);
    expect(mirroredRequest?.orderedQty).toBe(8);
    expect(mirroredRequest?.receivedQty).toBe(8);
  });
});
