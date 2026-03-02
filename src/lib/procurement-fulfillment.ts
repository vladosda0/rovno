import { getProcurementItemById } from "@/data/procurement-store";
import { normalizeName } from "@/lib/procurement-utils";
import type {
  InventoryLocation,
  OrderWithLines,
  ProcurementItemV2,
} from "@/types/entities";

export interface InStockItemByLocation {
  procurementItemId: string;
  qty: number;
  plannedValue: number;
  actualValue: number;
  orderIds: string[];
}

export interface InStockLocationGroup {
  locationId: string;
  locationName: string;
  locationAddress?: string;
  totalValue: number;
  items: InStockItemByLocation[];
}

export interface TabChipStat {
  count: number;
  total: number;
}

export interface ProcurementTabChipTotals {
  requested: TabChipStat;
  ordered: TabChipStat;
  inStock: TabChipStat;
}

export interface InventoryStockSnapshotRow {
  projectId: string;
  locationId: string;
  inventoryKey: string;
  qty: number;
}

function isAppliedOrder(order: OrderWithLines): boolean {
  return order.status === "placed" || order.status === "received";
}

function unitPriceForItem(item: ProcurementItemV2): number {
  return item.actualUnitPrice ?? item.plannedUnitPrice ?? 0;
}

export function toInventoryKey(item: Pick<ProcurementItemV2, "name" | "spec" | "unit">): string {
  return [
    normalizeName(item.name),
    item.spec ? normalizeName(item.spec) : "",
    item.unit.trim().toLowerCase(),
  ].join("|");
}

export function computeRemainingRequestedQty(requestId: string, orders: OrderWithLines[]): number {
  const item = getProcurementItemById(requestId);
  if (!item) return 0;

  const fulfilledFromOrders = orders
    .filter(isAppliedOrder)
    .flatMap((order) => order.lines)
    .filter((line) => line.procurementItemId === requestId)
    .reduce((sum, line) => sum + line.qty, 0);

  return Math.max(item.requiredQty - fulfilledFromOrders, 0);
}

export function computeOrderedOpenQty(requestId: string, orders: OrderWithLines[]): number {
  return orders
    .filter((order) => order.kind === "supplier" && order.status === "placed")
    .flatMap((order) => order.lines)
    .filter((line) => line.procurementItemId === requestId)
    .reduce((sum, line) => sum + Math.max(line.qty - line.receivedQty, 0), 0);
}

export function computeFulfilledQty(requestId: string, orders: OrderWithLines[]): number {
  return orders
    .filter(isAppliedOrder)
    .flatMap((order) => order.lines)
    .filter((line) => line.procurementItemId === requestId)
    .reduce((sum, line) => sum + line.qty, 0);
}

export function computeInStockByLocation(
  projectId: string,
  items: ProcurementItemV2[],
  orders: OrderWithLines[],
  locations: InventoryLocation[],
): InStockLocationGroup[] {
  const qtyByLocationItem = new Map<string, number>();
  const orderIdsByLocationItem = new Map<string, Set<string>>();

  const locationNameById = new Map(locations.map((location) => [location.id, location]));
  const itemById = new Map(items.map((item) => [item.id, item]));

  const applyQty = (locationId: string, itemId: string, delta: number, orderId: string) => {
    if (!locationId || !itemById.has(itemId) || delta === 0) return;
    const key = `${locationId}::${itemId}`;
    const next = (qtyByLocationItem.get(key) ?? 0) + delta;
    qtyByLocationItem.set(key, next);

    const orderIds = orderIdsByLocationItem.get(key) ?? new Set<string>();
    orderIds.add(orderId);
    orderIdsByLocationItem.set(key, orderIds);
  };

  orders
    .filter((order) => order.projectId === projectId && isAppliedOrder(order))
    .forEach((order) => {
      const fallbackLocation = locations.find((location) => location.isDefault)?.id ?? locations[0]?.id ?? "";
      const events = order.receiveEvents ?? [];

      if (events.length > 0) {
        events.forEach((event) => {
          if (!itemById.has(event.procurementItemId)) return;
          applyQty(event.locationId, event.procurementItemId, event.deltaQty, order.id);
        });
        return;
      }

      // Legacy fallback for orders without receive/move event history.
      order.lines.forEach((line) => {
        if (!itemById.has(line.procurementItemId)) return;

        if (order.kind === "supplier") {
          const locationId = order.deliverToLocationId ?? fallbackLocation;
          applyQty(locationId, line.procurementItemId, line.receivedQty, order.id);
          return;
        }

        const toLocationId = order.toLocationId ?? order.deliverToLocationId ?? fallbackLocation;
        const fromLocationId = order.fromLocationId ?? "";
        applyQty(toLocationId, line.procurementItemId, line.qty, order.id);
        applyQty(fromLocationId, line.procurementItemId, -line.qty, order.id);
      });
    });

  const groupsMap = new Map<string, InStockLocationGroup>();
  qtyByLocationItem.forEach((qty, key) => {
    if (qty <= 0) return;
    const [locationId, itemId] = key.split("::");
    const item = itemById.get(itemId);
    if (!item) return;

    const location = locationNameById.get(locationId);
    const group = groupsMap.get(locationId) ?? {
      locationId,
      locationName: location?.name ?? "Unknown location",
      locationAddress: location?.address,
      totalValue: 0,
      items: [],
    };

    const plannedValue = (item.plannedUnitPrice ?? 0) * qty;
    const actualValue = unitPriceForItem(item) * qty;

    group.items.push({
      procurementItemId: item.id,
      qty,
      plannedValue,
      actualValue,
      orderIds: Array.from(orderIdsByLocationItem.get(key) ?? []),
    });
    group.totalValue += actualValue;
    groupsMap.set(locationId, group);
  });

  return Array.from(groupsMap.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.procurementItemId.localeCompare(b.procurementItemId)),
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName));
}

export function computeTabChipTotals(
  projectId: string,
  items: ProcurementItemV2[],
  orders: OrderWithLines[],
  inventoryRows: InventoryStockSnapshotRow[],
): ProcurementTabChipTotals {
  const requestedItems = items
    .filter((item) => item.projectId === projectId)
    .map((item) => ({ item, remaining: computeRemainingRequestedQty(item.id, orders) }))
    .filter(({ remaining }) => remaining > 0);

  const requested: TabChipStat = {
    count: requestedItems.length,
    total: requestedItems.reduce((sum, entry) => sum + (entry.item.plannedUnitPrice ?? 0) * entry.remaining, 0),
  };

  const orderedOrders = orders.filter((order) => order.projectId === projectId && order.kind === "supplier" && order.status === "placed");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const ordered: TabChipStat = {
    count: orderedOrders.length,
    total: orderedOrders.reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => {
      const item = itemById.get(line.procurementItemId);
      const openQty = Math.max(line.qty - line.receivedQty, 0);
      const unitPrice = line.actualUnitPrice
        ?? line.plannedUnitPrice
        ?? item?.actualUnitPrice
        ?? item?.plannedUnitPrice
        ?? 0;
      return lineSum + unitPrice * openQty;
    }, 0), 0),
  };

  const priceByInventoryKey = new Map<string, number>();
  items
    .filter((item) => item.projectId === projectId)
    .forEach((item) => {
      const key = toInventoryKey(item);
      if (!priceByInventoryKey.has(key)) {
        priceByInventoryKey.set(key, unitPriceForItem(item));
      }
    });

  const inStockRows = inventoryRows
    .filter((row) => row.projectId === projectId && row.qty > 0);
  const inStock: TabChipStat = {
    count: inStockRows.length,
    total: inStockRows.reduce((sum, row) => sum + (priceByInventoryKey.get(row.inventoryKey) ?? 0) * row.qty, 0),
  };

  return { requested, ordered, inStock };
}
