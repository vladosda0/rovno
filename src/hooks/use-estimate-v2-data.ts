import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProjectsSensitiveDetailMap } from "@/hooks/use-home-sensitive-detail-map";
import { useProcurementV2, useHRItems, useHRPayments } from "@/hooks/use-mock-data";
import { useOrders } from "@/hooks/use-order-data";
import { subscribeHR } from "@/data/hr-store";
import { subscribeOrders } from "@/data/order-store";
import { subscribeProcurement } from "@/data/procurement-store";
import {
  findVersionByShareId,
  getEstimateV2ProjectState,
  hydrateEstimateV2ProjectFromWorkspace,
  subscribeEstimateV2,
  type EstimateV2ProjectSyncState,
  type EstimateV2ProjectView,
} from "@/data/estimate-v2-store";
import {
  buildEstimateV2FinanceProjectSummary,
  getEstimateV2FinanceProjectSummary,
  applySensitiveDetailToEstimateV2FinanceSnapshot,
  getEstimateV2FinanceSnapshot,
  resolveEstimateV2FinanceProjectMeta,
  type EstimateV2FinanceProjectSummary,
  type EstimateV2FinanceSnapshot,
} from "@/lib/estimate-v2/finance-read-model";
import { computeFactFromDataSources } from "@/lib/estimate-v2/rollups";
import * as store from "@/data/store";
import { useWorkspaceMode, useWorkspaceProjects } from "@/hooks/use-workspace-source";
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

export function useEstimateV2Share(shareId: string): { projectId: string; version: EstimateV2Version } | null {
  const getter = useCallback(() => findVersionByShareId(shareId), [shareId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeEstimateV2(update);
  }, [getter]);

  return value;
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
  options: { hrReadsEnabled: boolean },
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
    return buildEstimateV2FinanceProjectSummary(project.id, project.title, state, fact);
  }, [
    revision,
    projectId,
    projectInput,
    options.hrReadsEnabled,
    procurementItems,
    orders,
    hrItems,
    hrPayments,
  ]);
}

const EMPTY_HOME_FINANCE_SNAPSHOT: EstimateV2FinanceSnapshot = {
  projects: [],
  totals: { plannedBudgetCents: 0, spentCents: 0, toBePaidCents: 0, varianceCents: 0 },
};

export function useEstimateV2FinanceSnapshot(): {
  snapshot: EstimateV2FinanceSnapshot;
  sensitiveDetailLoading: boolean;
} {
  const workspaceMode = useWorkspaceMode();
  const workspaceHookProjects = useWorkspaceProjects();
  const projects =
    workspaceMode.kind === "demo" || workspaceMode.kind === "local"
      ? store.getProjects()
      : workspaceHookProjects;

  const { canViewSensitiveDetailByProjectId, isLoading: sensitiveDetailLoading } =
    useWorkspaceProjectsSensitiveDetailMap();

  const getter = useCallback(
    () => getEstimateV2FinanceSnapshot(projects),
    [projects],
  );
  const [raw, setRaw] = useState(getter);

  useEffect(() => {
    const update = () => setRaw(getter());
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
    setRaw(getter());
  }, [getter]);

  const snapshot = useMemo(() => {
    if (sensitiveDetailLoading) {
      return EMPTY_HOME_FINANCE_SNAPSHOT;
    }
    return applySensitiveDetailToEstimateV2FinanceSnapshot(raw, (projectId) =>
      canViewSensitiveDetailByProjectId.get(projectId) ?? false,
    );
  }, [raw, sensitiveDetailLoading, canViewSensitiveDetailByProjectId]);

  return { snapshot, sensitiveDetailLoading };
}
