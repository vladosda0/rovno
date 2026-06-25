import { useCallback, useEffect, useMemo, useState } from "react";
import { useProcurementV2, useHRItems, useHRPayments } from "@/hooks/use-mock-data";
import { useOrders } from "@/hooks/use-order-data";
import { subscribeHR } from "@/data/hr-store";
import { subscribeOrders } from "@/data/order-store";
import { subscribeProcurement } from "@/data/procurement-store";
import { useQuery } from "@tanstack/react-query";
import {
  findVersionByShareId,
  getEstimateV2ProjectState,
  hydrateEstimateV2ProjectFromWorkspace,
  subscribeEstimateV2,
  type EstimateV2ProjectSyncState,
  type EstimateV2ProjectView,
} from "@/data/estimate-v2-store";
import { fetchSharedEstimateVersion } from "@/data/estimate-share-source";
import {
  buildEstimateV2FinanceProjectSummary,
  getEstimateV2FinanceProjectSummary,
  resolveEstimateV2FinanceProjectMeta,
  type EstimateV2FinanceProjectSummary,
  type EstimateV2FinanceTaskSlice,
} from "@/lib/estimate-v2/finance-read-model";
import { computeFactFromDataSources } from "@/lib/estimate-v2/rollups";
import * as store from "@/data/store";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { Project } from "@/types/entities";
import type { EstimateV2Version } from "@/types/estimate-v2";

export const EMPTY_ESTIMATE_V2_PROJECT_SYNC_STATE: EstimateV2ProjectSyncState = {
  estimateRevision: null,
  draftSaveStatus: "idle",
  draftSaveLastSucceededAt: null,
  draftSaveLastError: null,
  domains: {
    tasks: {
      status: "idle",
      projectedRevision: null,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      lastError: null,
    },
    procurement: {
      status: "idle",
      projectedRevision: null,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      lastError: null,
    },
    hr: {
      status: "idle",
      projectedRevision: null,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      lastError: null,
    },
  },
};

export function useEstimateV2Project(projectId: string): EstimateV2ProjectView & { isLoading: boolean } {
  const workspaceMode = useWorkspaceMode();
  const getter = useCallback(() => getEstimateV2ProjectState(projectId), [projectId]);
  const [value, setValue] = useState(getter);
  const [isLoading, setIsLoading] = useState(
    workspaceMode.kind === "pending-supabase" || (workspaceMode.kind === "supabase" && Boolean(projectId)),
  );

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeEstimateV2(update);
  }, [getter]);

  useEffect(() => {
    setValue(getter());
  }, [getter]);

  useEffect(() => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    if (workspaceMode.kind === "pending-supabase") {
      setIsLoading(true);
      return;
    }

    if (workspaceMode.kind !== "supabase") {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void hydrateEstimateV2ProjectFromWorkspace(projectId, {
      profileId: workspaceMode.profileId,
    }).finally(() => {
      if (cancelled) return;
      setValue(getter());
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    getter,
    projectId,
    workspaceMode.kind,
    workspaceMode.kind === "supabase" ? workspaceMode.profileId : null,
  ]);

  return {
    ...value,
    sync: value.sync ?? EMPTY_ESTIMATE_V2_PROJECT_SYNC_STATE,
    isLoading,
  };
}

export function useEstimateV2ProjectSync(projectId: string): EstimateV2ProjectSyncState {
  return useEstimateV2Project(projectId).sync ?? EMPTY_ESTIMATE_V2_PROJECT_SYNC_STATE;
}

export interface EstimateV2ShareState {
  shared: { projectId: string; version: EstimateV2Version } | null;
  status: "loading" | "ready" | "not_found" | "error";
  error: string | null;
}

const EMPTY_SHARE_STATE: EstimateV2ShareState = {
  shared: null,
  status: "loading",
  error: null,
};

export function useEstimateV2Share(shareId: string): EstimateV2ShareState {
  const localGetter = useCallback(() => findVersionByShareId(shareId), [shareId]);
  const [localValue, setLocalValue] = useState(localGetter);

  useEffect(() => {
    setLocalValue(localGetter());
    const update = () => setLocalValue(localGetter());
    return subscribeEstimateV2(update);
  }, [localGetter]);

  const remoteQuery = useQuery({
    queryKey: ["estimate-share", shareId],
    queryFn: () => fetchSharedEstimateVersion(shareId),
    enabled: Boolean(shareId),
    staleTime: 30_000,
    retry: 1,
  });

  if (!shareId) {
    return { ...EMPTY_SHARE_STATE, status: "not_found" };
  }

  // Prefer the Supabase row (cross-browser truth) when it has loaded.
  if (remoteQuery.data) {
    return { shared: remoteQuery.data, status: "ready", error: null };
  }

  // Local store fallback covers the same-session case before the persisted
  // snapshot lands, and works in workspace=local mode where the Supabase
  // call is not authoritative.
  if (localValue) {
    return { shared: localValue, status: "ready", error: null };
  }

  if (remoteQuery.isLoading) {
    return { ...EMPTY_SHARE_STATE, status: "loading" };
  }

  if (remoteQuery.isError) {
    const message = remoteQuery.error instanceof Error
      ? remoteQuery.error.message
      : String(remoteQuery.error);
    return { shared: null, status: "error", error: message };
  }

  return { shared: null, status: "not_found", error: null };
}

export function useEstimateV2FinanceProjectSummary(
  projectId: string,
  projectInput?: Pick<Project, "id" | "title"> | null,
): EstimateV2FinanceProjectSummary | null {
  const getter = useCallback(
    () => getEstimateV2FinanceProjectSummary(projectId, projectInput),
    [projectId, projectInput],
  );
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    const unsubs = [
      subscribeEstimateV2(update),
      store.subscribe(update),
      subscribeProcurement(update),
      subscribeOrders(update),
      subscribeHR(update),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [getter]);

  useEffect(() => {
    setValue(getter());
  }, [getter]);

  return value;
}

/**
 * Same finance truth as ProjectEstimate: fact rollups from workspace procurement/orders/HR hooks,
 * not only in-memory store snapshots.
 */
export function useEstimateV2FinanceProjectSummaryFromWorkspace(
  projectId: string,
  projectInput: Pick<Project, "id" | "title"> | null | undefined,
  options: { hrReadsEnabled: boolean; tasks?: EstimateV2FinanceTaskSlice[] },
): EstimateV2FinanceProjectSummary | null {
  const procurementItems = useProcurementV2(projectId);
  const orders = useOrders(projectId);
  const hrItems = useHRItems(projectId, { enabled: options.hrReadsEnabled });
  const hrPayments = useHRPayments(projectId, { enabled: options.hrReadsEnabled });

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    const unsubs = [
      subscribeEstimateV2(bump),
      store.subscribe(bump),
      subscribeProcurement(bump),
      subscribeOrders(bump),
      subscribeHR(bump),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [projectId]);

  return useMemo(() => {
    const project = resolveEstimateV2FinanceProjectMeta(projectId, projectInput ?? null);
    if (!project) return null;
    const state = getEstimateV2ProjectState(projectId);
    const fact = computeFactFromDataSources({
      procurementItems,
      orders,
      hrItems,
      hrPayments,
    });
    return buildEstimateV2FinanceProjectSummary(project.id, project.title, state, fact, options.tasks);
  }, [
    revision,
    projectId,
    projectInput,
    options.hrReadsEnabled,
    options.tasks,
    procurementItems,
    orders,
    hrItems,
    hrPayments,
  ]);
}
