import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getOrder,
  listOrdersByProject,
  listPlacedSupplierOrders,
  listPlacedSupplierOrdersAllProjects,
  subscribeOrders,
} from "@/data/order-store";
import { getOrdersSource } from "@/data/orders-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { resolveFinanceRowLoadAccess, usePermission } from "@/lib/permissions";
import type { FinanceRowLoadAccess } from "@/lib/permissions";
import type { OrderWithLines } from "@/types/entities";

const ORDERS_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_ORDERS: OrderWithLines[] = [];

export const orderProjectOrdersQueryRoot = (profileId: string, projectId: string) =>
  ["orders", "project-orders", profileId, projectId] as const;

export const orderPlacedSupplierOrdersQueryRoot = (profileId: string, projectId: string) =>
  ["orders", "placed-supplier-orders", profileId, projectId] as const;

export const orderQueryKeys = {
  projectOrders: (profileId: string, projectId: string, financeAccess: FinanceRowLoadAccess) =>
    [...orderProjectOrdersQueryRoot(profileId, projectId), financeAccess] as const,
  placedSupplierOrders: (profileId: string, projectId: string, financeAccess: FinanceRowLoadAccess) =>
    [...orderPlacedSupplierOrdersQueryRoot(profileId, projectId), financeAccess] as const,
  placedSupplierOrdersAllProjects: (profileId: string) =>
    ["orders", "placed-supplier-orders-all-projects", profileId] as const,
  orderById: (profileId: string, orderId: string) =>
    ["orders", "order-by-id", profileId, orderId] as const,
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
    return subscribeOrders(update);
  }, [enabled, fallback, getter]);

  return enabled ? value : fallback;
}

export function useOrders(projectId: string): OrderWithLines[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const { seam } = usePermission(projectId);
  const financeAccess = useMemo(() => resolveFinanceRowLoadAccess(seam), [seam]);
  const getter = useCallback(() => listOrdersByProject(projectId), [projectId]);
  const browserOrders = useStoreValue(
    getter,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_ORDERS,
  );
  const ordersQuery = useQuery({
    queryKey: supabaseMode
      ? orderQueryKeys.projectOrders(supabaseMode.profileId, projectId, financeAccess)
      : orderQueryKeys.projectOrders("browser", projectId, "full"),
    queryFn: async () => {
      const source = await getOrdersSource(supabaseMode ?? undefined);
      return source.getProjectOrders(projectId, financeAccess);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: ORDERS_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserOrders;
  }

  return ordersQuery.data ?? EMPTY_ORDERS;
}

export function usePlacedSupplierOrders(projectId: string): OrderWithLines[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const { seam } = usePermission(projectId);
  const financeAccess = useMemo(() => resolveFinanceRowLoadAccess(seam), [seam]);
  const getter = useCallback(() => listPlacedSupplierOrders(projectId), [projectId]);
  const browserOrders = useStoreValue(
    getter,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_ORDERS,
  );
  const ordersQuery = useQuery({
    queryKey: supabaseMode
      ? orderQueryKeys.placedSupplierOrders(supabaseMode.profileId, projectId, financeAccess)
      : orderQueryKeys.placedSupplierOrders("browser", projectId, "full"),
    queryFn: async () => {
      const source = await getOrdersSource(supabaseMode ?? undefined);
      return source.getPlacedSupplierOrders(projectId, financeAccess);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: ORDERS_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserOrders;
  }

  return ordersQuery.data ?? EMPTY_ORDERS;
}

export function usePlacedSupplierOrdersAllProjects(): OrderWithLines[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getter = useCallback(() => listPlacedSupplierOrdersAllProjects(), []);
  const browserOrders = useStoreValue(
    getter,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_ORDERS,
  );
  const ordersQuery = useQuery({
    queryKey: supabaseMode
      ? orderQueryKeys.placedSupplierOrdersAllProjects(supabaseMode.profileId)
      : orderQueryKeys.placedSupplierOrdersAllProjects("browser"),
    queryFn: async () => {
      const source = await getOrdersSource(supabaseMode ?? undefined);
      return source.getPlacedSupplierOrdersAllProjects();
    },
    enabled: Boolean(supabaseMode),
    staleTime: ORDERS_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserOrders;
  }

  return ordersQuery.data ?? EMPTY_ORDERS;
}

export function useOrder(orderId?: string | null): OrderWithLines | null {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getter = useCallback(() => {
    if (!orderId) return null;
    return getOrder(orderId) ?? null;
  }, [orderId]);
  const browserOrder = useStoreValue(
    getter,
    mode.kind === "demo" || mode.kind === "local",
    null,
  );
  const orderQuery = useQuery({
    queryKey: supabaseMode && orderId
      ? orderQueryKeys.orderById(supabaseMode.profileId, orderId)
      : orderQueryKeys.orderById("browser", orderId ?? ""),
    queryFn: async () => {
      if (!orderId) {
        return null;
      }

      const source = await getOrdersSource(supabaseMode ?? undefined);
      return source.getOrderById(orderId);
    },
    enabled: Boolean(supabaseMode && orderId),
    staleTime: ORDERS_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserOrder;
  }

  return orderQuery.data ?? null;
}
