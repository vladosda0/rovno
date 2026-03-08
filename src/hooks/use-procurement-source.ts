import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  getProcurementItems,
  subscribeProcurement,
} from "@/data/procurement-store";
import { getProcurementSource } from "@/data/procurement-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { ProcurementItemV2 } from "@/types/entities";

const PROCUREMENT_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_PROCUREMENT_ITEMS: ProcurementItemV2[] = [];

export const procurementQueryKeys = {
  projectItems: (profileId: string, projectId: string) =>
    ["procurement", "project-items", profileId, projectId] as const,
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

export function useProjectProcurementItems(projectId: string): ProcurementItemV2[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getItems = useCallback(() => getProcurementItems(projectId), [projectId]);
  const browserItems = useStoreValue(
    getItems,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_PROCUREMENT_ITEMS,
  );
  const itemsQuery = useQuery({
    queryKey: supabaseMode
      ? procurementQueryKeys.projectItems(supabaseMode.profileId, projectId)
      : procurementQueryKeys.projectItems("browser", projectId),
    queryFn: async () => {
      const source = await getProcurementSource(supabaseMode ?? undefined);
      return source.getProjectProcurementItems(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: PROCUREMENT_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserItems;
  }

  return itemsQuery.data ?? EMPTY_PROCUREMENT_ITEMS;
}
