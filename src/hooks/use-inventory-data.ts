import { useCallback, useEffect, useState } from "react";
import {
  getStock,
  listLocations,
  listStockAllProjects,
  listStockByProject,
  subscribeInventory,
  type InventoryStockRow,
} from "@/data/inventory-store";
import type { InventoryLocation } from "@/types/entities";

export function useLocations(projectId: string): InventoryLocation[] {
  const getter = useCallback(() => listLocations(projectId), [projectId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeInventory(update);
  }, [getter]);

  return value;
}

export function useInventoryStock(projectId: string): InventoryStockRow[] {
  const getter = useCallback(() => listStockByProject(projectId), [projectId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeInventory(update);
  }, [getter]);

  return value;
}

export function useAllInventoryStock(): InventoryStockRow[] {
  const getter = useCallback(() => listStockAllProjects(), []);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeInventory(update);
  }, [getter]);

  return value;
}

export function useStock(projectId: string, locationId: string, inventoryKey: string): number {
  const getter = useCallback(() => getStock(projectId, locationId, inventoryKey), [projectId, locationId, inventoryKey]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeInventory(update);
  }, [getter]);

  return value;
}
