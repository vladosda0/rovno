import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getProcurementItems,
  subscribeProcurement,
} from "@/data/procurement-store";
import { getProcurementSource } from "@/data/procurement-source";
import { useEstimateV2ProjectSync } from "@/hooks/use-estimate-v2-data";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { resolveFinanceRowLoadAccess, usePermission } from "@/lib/permissions";
import type { FinanceRowLoadAccess } from "@/lib/permissions";
import type { ProcurementItemV2 } from "@/types/entities";

const PROCUREMENT_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_PROCUREMENT_ITEMS: ProcurementItemV2[] = [];

export const procurementProjectItemsQueryRoot = (profileId: string, projectId: string) =>
  ["procurement", "project-items", profileId, projectId] as const;

export const procurementQueryKeys = {
  projectItems: (profileId: string, projectId: string, financeAccess: FinanceRowLoadAccess) =>
    [...procurementProjectItemsQueryRoot(profileId, projectId), financeAccess] as const,
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
    return subscribeProcurement(update);
  }, [enabled, fallback, getter]);

  return enabled ? value : fallback;
}

export function useProjectProcurementItemsState(
  projectId: string,
): { items: ProcurementItemV2[]; isLoading: boolean } {
  const mode = useWorkspaceMode();
  const estimateSync = useEstimateV2ProjectSync(projectId);
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const { seam } = usePermission(projectId);
  const financeAccess = useMemo(() => resolveFinanceRowLoadAccess(seam), [seam]);
  const getItems = useCallback(() => getProcurementItems(projectId), [projectId]);
  const browserItems = useStoreValue(
    getItems,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_PROCUREMENT_ITEMS,
  );
  const itemsQuery = useQuery({
    queryKey: supabaseMode
      ? [...procurementQueryKeys.projectItems(supabaseMode.profileId, projectId, financeAccess)]
      : [...procurementQueryKeys.projectItems("browser", projectId, "full")],
    queryFn: async () => {
      const source = await getProcurementSource(supabaseMode ?? undefined);
      return source.getProjectProcurementItems(projectId, financeAccess);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: PROCUREMENT_QUERY_STALE_TIME_MS,
  });

  // Keep the query key stable across projection advances so cached data does not
  // collapse to empty (isPending) on every sync, which remounts the list and blanks
  // open editors. Instead, when the sync's projectedRevision advances, invalidate the
  // procurement root: with a stable key this is a background refetch (isFetching) that
  // keeps the previous data mounted. Freshness is unchanged (every projection still refetches).
  const queryClient = useQueryClient();
  const projectedRevision = estimateSync.domains.procurement.projectedRevision ?? null;
  const invalidateProfileId = supabaseMode?.profileId ?? null;
  useEffect(() => {
    if (!invalidateProfileId || !projectId) return;
    queryClient.invalidateQueries({
      queryKey: procurementProjectItemsQueryRoot(invalidateProfileId, projectId),
    });
  }, [queryClient, invalidateProfileId, projectId, projectedRevision]);

  if (mode.kind === "demo" || mode.kind === "local") {
    return { items: browserItems, isLoading: false };
  }

  if (!supabaseMode) {
    // guest has no workspace data; pending-supabase is still resolving auth.
    return { items: EMPTY_PROCUREMENT_ITEMS, isLoading: mode.kind === "pending-supabase" };
  }

  return { items: itemsQuery.data ?? EMPTY_PROCUREMENT_ITEMS, isLoading: itemsQuery.isPending };
}

export function useProjectProcurementItems(projectId: string): ProcurementItemV2[] {
  return useProjectProcurementItemsState(projectId).items;
}
