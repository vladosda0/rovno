import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProjectsSensitiveDetailMap } from "@/hooks/use-home-sensitive-detail-map";
import { useProject } from "@/hooks/use-mock-data";
import {
  PROCUREMENT_QUERY_STALE_TIME_MS,
  procurementQueryKeys,
  useProjectProcurementItemsState,
} from "@/hooks/use-procurement-source";
import { ORDERS_QUERY_STALE_TIME_MS, orderQueryKeys, useOrders } from "@/hooks/use-order-data";
import {
  INVENTORY_QUERY_STALE_TIME_MS,
  inventoryQueryKeys,
  useLocations,
} from "@/hooks/use-inventory-data";
import { useWorkspaceMode, useWorkspaceProjectsState } from "@/hooks/use-workspace-source";
import { getInventorySource } from "@/data/inventory-source";
import { getOrdersSource } from "@/data/orders-source";
import { getProcurementSource } from "@/data/procurement-source";
import { subscribe } from "@/data/store";
import { subscribeProcurement } from "@/data/procurement-store";
import { subscribeOrders } from "@/data/order-store";
import { subscribeInventory } from "@/data/inventory-store";
import {
  applySensitiveDetailToProcurementReadSnapshot,
  buildProcurementReadProjectSummary,
  buildProcurementReadSnapshot,
  getProcurementReadSnapshot,
  type ProcurementReadProjectSummary,
  type ProcurementReadSnapshot,
} from "@/lib/procurement-read-model";

const EMPTY_HOME_PROCUREMENT_SNAPSHOT: ProcurementReadSnapshot = {
  projects: [],
  totals: {
    totalCount: 0,
    requestedCount: 0,
    orderedCount: 0,
    inStockCount: 0,
    requestedTotal: 0,
    orderedTotal: 0,
    inStockTotal: 0,
    inStockPlannedTotal: 0,
    inStockActualTotal: 0,
  },
};

export function useProcurementReadSnapshot(): ProcurementReadSnapshot {
  const getter = useCallback(() => getProcurementReadSnapshot(), []);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    const unsubs = [
      subscribe(update),
      subscribeProcurement(update),
      subscribeOrders(update),
      subscribeInventory(update),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [getter]);

  return value;
}

/**
 * Home Procurement tab: per-project sensitive-detail redaction over the same read model as
 * `getProcurementReadSnapshot`. Demo and local read the browser stores; Supabase fans out over the
 * single-project sources, each project under its own finance access.
 */
export function useHomeProcurementReadSnapshot(): {
  snapshot: ProcurementReadSnapshot;
  sensitiveDetailLoading: boolean;
  loadFailed: boolean;
} {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const {
    projects: workspaceProjects,
    isLoading: projectsLoading,
    isError: projectsFailed,
  } = useWorkspaceProjectsState();
  const {
    canViewSensitiveDetailByProjectId,
    financeAccessByProjectId,
    isLoading: sensitiveDetailLoading,
    accessLoadFailed,
  } = useWorkspaceProjectsSensitiveDetailMap();

  const getter = useCallback(() => getProcurementReadSnapshot(), []);
  const [raw, setRaw] = useState(getter);

  useEffect(() => {
    const update = () => setRaw(getter());
    const unsubs = [
      subscribe(update),
      subscribeProcurement(update),
      subscribeOrders(update),
      subscribeInventory(update),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [getter]);

  const fanOutProjects = !supabaseMode ? [] : workspaceProjects.flatMap((project) => {
    const financeAccess = financeAccessByProjectId.get(project.id);
    return financeAccess ? [{ project, financeAccess }] : [];
  });

  const itemsQueries = useQueries({
    queries: fanOutProjects.map(({ project, financeAccess }) => ({
      queryKey: procurementQueryKeys.projectItems(supabaseMode?.profileId ?? "", project.id, financeAccess),
      queryFn: async () => {
        const source = await getProcurementSource(supabaseMode ?? undefined);
        return source.getProjectProcurementItems(project.id, financeAccess);
      },
      staleTime: PROCUREMENT_QUERY_STALE_TIME_MS,
    })),
  });
  const ordersQueries = useQueries({
    queries: fanOutProjects.map(({ project, financeAccess }) => ({
      queryKey: orderQueryKeys.projectOrders(supabaseMode?.profileId ?? "", project.id, financeAccess),
      queryFn: async () => {
        const source = await getOrdersSource(supabaseMode ?? undefined);
        return source.getProjectOrders(project.id, financeAccess);
      },
      staleTime: ORDERS_QUERY_STALE_TIME_MS,
    })),
  });
  const locationsQueries = useQueries({
    queries: fanOutProjects.map(({ project }) => ({
      queryKey: inventoryQueryKeys.projectLocations(supabaseMode?.profileId ?? "", project.id),
      queryFn: async () => {
        const source = await getInventorySource(supabaseMode ?? undefined);
        return source.getProjectLocations(project.id);
      },
      staleTime: INVENTORY_QUERY_STALE_TIME_MS,
    })),
  });

  const sourceQueries = [...itemsQueries, ...ordersQueries, ...locationsQueries];
  const isLoading = sensitiveDetailLoading
    || (Boolean(supabaseMode) && (projectsLoading || sourceQueries.some((query) => query.isPending)));

  let loadFailed = Boolean(supabaseMode) && (projectsFailed || Boolean(accessLoadFailed));
  const summaries: ProcurementReadProjectSummary[] = [];
  fanOutProjects.forEach(({ project }, index) => {
    const sources = [itemsQueries[index], ordersQueries[index], locationsQueries[index]];
    if (sources.some((query) => query?.isLoadingError)) {
      loadFailed = true;
      return;
    }
    const summary = buildProcurementReadProjectSummary(
      { id: project.id, title: project.title },
      itemsQueries[index]?.data ?? [],
      ordersQueries[index]?.data ?? [],
      locationsQueries[index]?.data ?? [],
    );
    if (summary) summaries.push(summary);
  });

  if (isLoading) {
    return { snapshot: EMPTY_HOME_PROCUREMENT_SNAPSHOT, sensitiveDetailLoading: true, loadFailed: false };
  }

  return {
    snapshot: applySensitiveDetailToProcurementReadSnapshot(
      supabaseMode ? buildProcurementReadSnapshot(summaries) : raw,
      (projectId) => canViewSensitiveDetailByProjectId.get(projectId) ?? false,
    ),
    sensitiveDetailLoading: false,
    loadFailed,
  };
}

/**
 * ONE project's procurement summary, built from that project's own sources.
 *
 * It used to derive from `useProcurementReadSnapshot`, i.e. fetch every project and filter down
 * to one. That snapshot reads the in-memory browser stores, which nothing hydrates in Supabase
 * mode, so this hook returned null for every authenticated user and the AI sidebar carried no
 * procurement context at all, with no error to notice (#215).
 *
 * The four hooks below each resolve demo / local / Supabase internally, so this needs no mode
 * branch of its own and demo mode keeps reading the same browser stores it always did.
 *
 * Known gap, tracked as #275: those hooks expose an `isLoading` that this one drops, so it
 * returns null while the queries are in flight and `buildAIProjectContext` renders that as
 * zeros. Strictly narrower than the defect it replaces (null unconditionally in Supabase mode),
 * but a prompt sent before the queries settle still tells the assistant the project has no
 * procurement, with no signal anything is missing.
 */
export function useProcurementReadProjectSummary(projectId: string): ProcurementReadProjectSummary | null {
  const { project } = useProject(projectId);
  const { items } = useProjectProcurementItemsState(projectId);
  const orders = useOrders(projectId);
  const locations = useLocations(projectId);

  return useMemo(() => {
    if (!project) return null;
    return buildProcurementReadProjectSummary(
      { id: project.id, title: project.title },
      items,
      orders,
      locations,
    );
  }, [project, items, orders, locations]);
}
