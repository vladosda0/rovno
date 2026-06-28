import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import * as store from "@/data/store";
import { getInventorySource } from "@/data/inventory-source";
import {
  getStock,
  listLocations,
  listStockAllProjects,
  listStockByProject,
  subscribeInventory,
  type InventoryStockRow,
} from "@/data/inventory-store";
import { useWorkspaceMode, useWorkspaceProjects } from "@/hooks/use-workspace-source";
import type { InventoryLocation, Project } from "@/types/entities";

const INVENTORY_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_LOCATIONS: InventoryLocation[] = [];
const EMPTY_STOCK_ROWS: InventoryStockRow[] = [];

export const inventoryQueryKeys = {
  projectLocations: (profileId: string, projectId: string) =>
    ["inventory", "project-locations", profileId, projectId] as const,
  projectStock: (profileId: string, projectId: string) =>
    ["inventory", "project-stock", profileId, projectId] as const,
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
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getter = useCallback(() => listStockByProject(projectId), [projectId]);
  const browserStock = useStoreValue(
    getter,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_STOCK_ROWS,
  );
  const stockQuery = useQuery({
    queryKey: supabaseMode
      ? inventoryQueryKeys.projectStock(supabaseMode.profileId, projectId)
      : inventoryQueryKeys.projectStock("browser", projectId),
    queryFn: async () => {
      const source = await getInventorySource(supabaseMode ?? undefined);
      return source.getProjectStock(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: INVENTORY_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserStock;
  }

  return stockQuery.data ?? EMPTY_STOCK_ROWS;
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

export interface HomeInventoryProjectSnapshot {
  projectId: string;
  projectTitle: string;
  rows: InventoryStockRow[];
}

export interface HomeInventorySnapshot {
  projects: HomeInventoryProjectSnapshot[];
  isLoading: boolean;
  totalRows: number;
}

const EMPTY_HOME_INVENTORY_PROJECTS: HomeInventoryProjectSnapshot[] = [];

/**
 * Home Inventory tab: real per-project stock aggregated across the user's projects, grouped by project.
 * Mirrors `useHomeProcurementReadSnapshot` shape; demo/local read the browser store, Supabase fans out via `useQueries`.
 */
export function useHomeInventorySnapshot(): HomeInventorySnapshot {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const workspaceHookProjects = useWorkspaceProjects();

  /** Align with the sensitive-detail map: demo/local use the browser store, not an empty Supabase project list. */
  const browserMode = mode.kind === "demo" || mode.kind === "local";
  const projects: Project[] = browserMode ? store.getProjects() : workspaceHookProjects;
  const projectIds = projects.map((project) => project.id);

  const getBrowserProjects = useCallback((): HomeInventoryProjectSnapshot[] => {
    return store.getProjects().map((project) => ({
      projectId: project.id,
      projectTitle: project.title,
      rows: listStockByProject(project.id),
    }));
  }, []);
  const browserProjects = useStoreValue(getBrowserProjects, browserMode, EMPTY_HOME_INVENTORY_PROJECTS);

  const stockQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: supabaseMode
        ? inventoryQueryKeys.projectStock(supabaseMode.profileId, projectId)
        : inventoryQueryKeys.projectStock("browser", projectId),
      queryFn: async () => {
        const source = await getInventorySource(supabaseMode ?? undefined);
        return source.getProjectStock(projectId);
      },
      enabled: Boolean(supabaseMode && projectId),
      staleTime: INVENTORY_QUERY_STALE_TIME_MS,
    })),
  });

  if (browserMode) {
    return {
      projects: browserProjects,
      isLoading: false,
      totalRows: browserProjects.reduce((sum, project) => sum + project.rows.length, 0),
    };
  }

  if (!supabaseMode) {
    return {
      projects: EMPTY_HOME_INVENTORY_PROJECTS,
      isLoading: mode.kind === "pending-supabase",
      totalRows: 0,
    };
  }

  if (stockQueries.some((query) => query.isPending)) {
    return { projects: EMPTY_HOME_INVENTORY_PROJECTS, isLoading: true, totalRows: 0 };
  }

  const supabaseProjects: HomeInventoryProjectSnapshot[] = projects.map((project, index) => ({
    projectId: project.id,
    projectTitle: project.title,
    rows: stockQueries[index]?.data ?? EMPTY_STOCK_ROWS,
  }));

  return {
    projects: supabaseProjects,
    isLoading: false,
    totalRows: supabaseProjects.reduce((sum, project) => sum + project.rows.length, 0),
  };
}
