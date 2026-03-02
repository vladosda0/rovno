import { useCallback, useEffect, useState } from "react";
import {
  getOrder,
  listOrdersByProject,
  listPlacedSupplierOrders,
  listPlacedSupplierOrdersAllProjects,
  subscribeOrders,
} from "@/data/order-store";
import type { OrderWithLines } from "@/types/entities";

export function useOrders(projectId: string): OrderWithLines[] {
  const getter = useCallback(() => listOrdersByProject(projectId), [projectId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeOrders(update);
  }, [getter]);

  return value;
}

export function usePlacedSupplierOrders(projectId: string): OrderWithLines[] {
  const getter = useCallback(() => listPlacedSupplierOrders(projectId), [projectId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeOrders(update);
  }, [getter]);

  return value;
}

export function usePlacedSupplierOrdersAllProjects(): OrderWithLines[] {
  const getter = useCallback(() => listPlacedSupplierOrdersAllProjects(), []);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeOrders(update);
  }, [getter]);

  return value;
}

export function useOrder(orderId?: string | null): OrderWithLines | null {
  const getter = useCallback(() => {
    if (!orderId) return null;
    return getOrder(orderId) ?? null;
  }, [orderId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeOrders(update);
  }, [getter]);

  return value;
}
