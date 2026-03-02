import { getProjects } from "@/data/store";
import { getAllProcurementItemsV2 } from "@/data/procurement-store";
import { normalizeName } from "@/lib/procurement-utils";
import type { InventoryLocation } from "@/types/entities";

export interface InventoryStockRow {
  projectId: string;
  locationId: string;
  inventoryKey: string;
  qty: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const locationsByProject = new Map<string, InventoryLocation[]>();
const stockByProject = new Map<string, Map<string, number>>();

function notify() {
  listeners.forEach((listener) => listener());
}

function defaultLocationId(projectId: string): string {
  return `${projectId}-loc-site`;
}

function stockCellKey(locationId: string, inventoryKey: string): string {
  return `${locationId}::${inventoryKey}`;
}

function ensureStockMap(projectId: string): Map<string, number> {
  const existing = stockByProject.get(projectId);
  if (existing) return existing;
  const next = new Map<string, number>();
  stockByProject.set(projectId, next);
  return next;
}

function ensureLocationList(projectId: string): InventoryLocation[] {
  const existing = locationsByProject.get(projectId);
  if (existing && existing.length > 0) return existing;
  const next: InventoryLocation[] = [{
    id: defaultLocationId(projectId),
    name: "To the site",
    address: "",
    isDefault: true,
  }];
  locationsByProject.set(projectId, next);
  return next;
}

function computeInventoryKey(name: string, spec: string | null | undefined, unit: string): string {
  return [
    normalizeName(name),
    spec ? normalizeName(spec) : "",
    unit.trim().toLowerCase(),
  ].join("|");
}

function setStockNoNotify(projectId: string, locationId: string, inventoryKey: string, qty: number) {
  const stock = ensureStockMap(projectId);
  const key = stockCellKey(locationId, inventoryKey);
  if (qty <= 0) {
    stock.delete(key);
    return;
  }
  stock.set(key, qty);
}

(function seedInventoryState() {
  const projects = getProjects();
  projects.forEach((project) => {
    ensureLocationList(project.id);
    ensureStockMap(project.id);
  });

  const items = getAllProcurementItemsV2();
  items.forEach((item) => {
    if (item.receivedQty <= 0) return;
    const locationId = defaultLocationId(item.projectId);
    const key = computeInventoryKey(item.name, item.spec, item.unit);
    const stock = ensureStockMap(item.projectId);
    const current = stock.get(stockCellKey(locationId, key)) ?? 0;
    setStockNoNotify(item.projectId, locationId, key, current + item.receivedQty);
  });
})();

export function subscribeInventory(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ensureDefaultLocation(projectId: string): InventoryLocation {
  const locations = ensureLocationList(projectId);
  const existingDefault = locations.find((location) => location.isDefault) ?? locations[0];
  if (existingDefault) return existingDefault;

  const created: InventoryLocation = {
    id: defaultLocationId(projectId),
    name: "To the site",
    address: "",
    isDefault: true,
  };
  locations.unshift(created);
  notify();
  return created;
}

export function listLocations(projectId: string): InventoryLocation[] {
  return [...ensureLocationList(projectId)];
}

export function createLocation(
  projectId: string,
  payload: { name: string; address?: string },
): InventoryLocation {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("Location name is required");
  }
  const locations = ensureLocationList(projectId);
  const created: InventoryLocation = {
    id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    address: payload.address?.trim() ?? "",
    isDefault: false,
  };
  locations.push(created);
  notify();
  return created;
}

export function getStock(projectId: string, locationId: string, inventoryKey: string): number {
  const stock = ensureStockMap(projectId);
  return stock.get(stockCellKey(locationId, inventoryKey)) ?? 0;
}

export function adjustStock(
  projectId: string,
  locationId: string,
  inventoryKey: string,
  deltaQty: number,
) {
  ensureLocationList(projectId);
  const stock = ensureStockMap(projectId);
  const key = stockCellKey(locationId, inventoryKey);
  const current = stock.get(key) ?? 0;
  const next = Math.max(0, current + deltaQty);
  if (next <= 0) {
    stock.delete(key);
  } else {
    stock.set(key, next);
  }
  notify();
}

export function listStockByProject(projectId: string): InventoryStockRow[] {
  const stock = ensureStockMap(projectId);
  const rows: InventoryStockRow[] = [];
  stock.forEach((qty, key) => {
    const [locationId, inventoryKey] = key.split("::");
    rows.push({ projectId, locationId, inventoryKey, qty });
  });
  return rows;
}

export function listStockAllProjects(): InventoryStockRow[] {
  const rows: InventoryStockRow[] = [];
  stockByProject.forEach((stock, projectId) => {
    stock.forEach((qty, key) => {
      const [locationId, inventoryKey] = key.split("::");
      rows.push({ projectId, locationId, inventoryKey, qty });
    });
  });
  return rows;
}

export function __unsafeResetInventoryForTests() {
  locationsByProject.clear();
  stockByProject.clear();
}
