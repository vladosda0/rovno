import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribe } from "@/data/store";
import { subscribeProcurement } from "@/data/procurement-store";
import { subscribeOrders } from "@/data/order-store";
import { subscribeInventory } from "@/data/inventory-store";
import {
  getProcurementReadSnapshot,
  type ProcurementReadProjectSummary,
  type ProcurementReadSnapshot,
} from "@/lib/procurement-read-model";

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

export function useProcurementReadProjectSummary(projectId: string): ProcurementReadProjectSummary | null {
  const snapshot = useProcurementReadSnapshot();
  return useMemo(
    () => snapshot.projects.find((summary) => summary.projectId === projectId) ?? null,
    [projectId, snapshot.projects],
  );
}
