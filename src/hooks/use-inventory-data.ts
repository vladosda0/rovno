import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getInventorySource } from "@/data/inventory-source";
import {
  getStock,
  listLocations,
  listStockAllProjects,
  listStockByProject,
  subscribeInventory,
  type InventoryStockRow,
} from "@/data/inventory-store";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { InventoryLocation } from "@/types/entities";

const INVENTORY_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_LOCATIONS: InventoryLocation[] = [];

const inventoryQueryKeys = {
  projectLocations: (profileId: string, projectId: string) =>
    ["inventory", "project-locations", profileId, projectId] as const,
};

function useStoreValue<T>(getter: () => T, enabled: boolean, fallback: T): T {
  const [value, setValue] = useState<T>(() => enabled ? getter() : fallback);

  useEffect(() => {
    if (!enabled) {
      setValue(fallback);
      return;
    }

    setValue(getter());
    const update = () => setValue(getter());
    return subscribeInventory(update);
  }, [enabled, fallback, getter]);

  return enabled ? value : fallback;
}

export function useLocations(projectId: string): InventoryLocation[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getter = useCallback(() => listLocations(projectId), [projectId]);
  const browserLocations = useStoreValue(
    getter,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_LOCATIONS,
  );
  const locationsQuery = useQuery({
    queryKey: supabaseMode
      ? inventoryQueryKeys.projectLocations(supabaseMode.profileId, projectId)
      : inventoryQueryKeys.projectLocations("browser", projectId),
    queryFn: async () => {
      const source = await getInventorySource(supabaseMode ?? undefined);
      return source.getProjectLocations(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: INVENTORY_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserLocations;
  }

  return locationsQuery.data ?? EMPTY_LOCATIONS;
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
