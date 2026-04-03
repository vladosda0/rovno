import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProjectsSensitiveDetailMap } from "@/hooks/use-home-sensitive-detail-map";
import { subscribe } from "@/data/store";
import { subscribeProcurement } from "@/data/procurement-store";
import { subscribeOrders } from "@/data/order-store";
import { subscribeInventory } from "@/data/inventory-store";
import {
  applySensitiveDetailToProcurementReadSnapshot,
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

/** Home Procurement tab: same read model as `getProcurementReadSnapshot` with per-project sensitive-detail redaction. */
export function useHomeProcurementReadSnapshot(): {
  snapshot: ProcurementReadSnapshot;
  sensitiveDetailLoading: boolean;
} {
  const { canViewSensitiveDetailByProjectId, isLoading: sensitiveDetailLoading } =
    useWorkspaceProjectsSensitiveDetailMap();

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

  const snapshot = useMemo(() => {
    if (sensitiveDetailLoading) {
      return EMPTY_HOME_PROCUREMENT_SNAPSHOT;
    }
    return applySensitiveDetailToProcurementReadSnapshot(raw, (projectId) =>
      canViewSensitiveDetailByProjectId.get(projectId) ?? false,
    );
  }, [raw, sensitiveDetailLoading, canViewSensitiveDetailByProjectId]);

  return { snapshot, sensitiveDetailLoading };
}

export function useProcurementReadProjectSummary(projectId: string): ProcurementReadProjectSummary | null {
  const snapshot = useProcurementReadSnapshot();
  return useMemo(
    () => snapshot.projects.find((summary) => summary.projectId === projectId) ?? null,
    [projectId, snapshot.projects],
  );
}
