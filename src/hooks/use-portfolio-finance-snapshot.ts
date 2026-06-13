import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import * as store from "@/data/store";
import { subscribeHR } from "@/data/hr-store";
import { subscribeOrders } from "@/data/order-store";
import { subscribeProcurement } from "@/data/procurement-store";
import { subscribeEstimateV2 } from "@/data/estimate-v2-store";
import { getEstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";
import {
  buildLocalPortfolioSnapshot,
  EMPTY_PORTFOLIO_SNAPSHOT,
  type PortfolioFinanceSnapshot,
} from "@/lib/finance/portfolio-read-model";
import { loadPortfolioFinanceSnapshot } from "@/data/portfolio-source";
import { useWorkspaceMode, useWorkspaceProjects } from "@/hooks/use-workspace-source";
import { useWorkspaceProjectsSensitiveDetailMap } from "@/hooks/use-home-sensitive-detail-map";

export interface UsePortfolioFinanceSnapshotResult {
  snapshot: PortfolioFinanceSnapshot | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Portfolio finance snapshot for Home → Финансы.
 * - supabase mode: the get_portfolio_finance_snapshot RPC (server-side redaction).
 * - demo/local mode: built from the browser store, redacted via the Home sensitive-detail map.
 * - pending-supabase: loading. guest: empty.
 */
export function usePortfolioFinanceSnapshot(): UsePortfolioFinanceSnapshotResult {
  const workspaceMode = useWorkspaceMode();
  const isSupabase = workspaceMode.kind === "supabase";
  const isLocalKind = workspaceMode.kind === "demo" || workspaceMode.kind === "local";
  const profileId = workspaceMode.kind === "supabase" ? workspaceMode.profileId : null;

  // --- Supabase path: RPC via react-query ---
  const rpcQuery = useQuery({
    queryKey: ["portfolio-finance-snapshot", profileId],
    queryFn: loadPortfolioFinanceSnapshot,
    enabled: isSupabase,
    staleTime: 30_000,
    retry: 1,
  });

  // --- Local path: build from the browser store, react to store mutations ---
  const workspaceProjects = useWorkspaceProjects();
  const { canViewSensitiveDetailByProjectId, isLoading: sensitiveDetailLoading } =
    useWorkspaceProjectsSensitiveDetailMap();

  const [storeRevision, setStoreRevision] = useState(0);
  useEffect(() => {
    if (!isLocalKind) return undefined;
    const bump = () => setStoreRevision((n) => n + 1);
    const unsubs = [
      subscribeEstimateV2(bump),
      store.subscribe(bump),
      subscribeProcurement(bump),
      subscribeOrders(bump),
      subscribeHR(bump),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [isLocalKind]);

  const localProjects = isLocalKind ? store.getProjects() : workspaceProjects;

  const localSnapshot = useMemo(() => {
    if (!isLocalKind) return null;
    const summaries = localProjects
      .map((project) => getEstimateV2FinanceProjectSummary(project.id, project))
      .filter((summary): summary is NonNullable<typeof summary> => summary != null);
    return buildLocalPortfolioSnapshot(
      summaries,
      (projectId) => canViewSensitiveDetailByProjectId.get(projectId) ?? false,
    );
    // storeRevision drives recomputation on store mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocalKind, localProjects, canViewSensitiveDetailByProjectId, storeRevision]);

  if (isLocalKind) {
    return {
      snapshot: sensitiveDetailLoading ? EMPTY_PORTFOLIO_SNAPSHOT : (localSnapshot ?? EMPTY_PORTFOLIO_SNAPSHOT),
      isLoading: sensitiveDetailLoading,
      isError: false,
      refetch: () => setStoreRevision((n) => n + 1),
    };
  }

  if (workspaceMode.kind === "pending-supabase") {
    return { snapshot: null, isLoading: true, isError: false, refetch: () => rpcQuery.refetch() };
  }

  if (!isSupabase) {
    // guest / unconfigured: nothing to show.
    return { snapshot: EMPTY_PORTFOLIO_SNAPSHOT, isLoading: false, isError: false, refetch: () => {} };
  }

  return {
    snapshot: rpcQuery.data ?? null,
    isLoading: rpcQuery.isLoading,
    isError: rpcQuery.isError,
    refetch: () => rpcQuery.refetch(),
  };
}
