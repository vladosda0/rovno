import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  getHRItems,
  getHRPayments,
  subscribeHR,
} from "@/data/hr-store";
import { getHRSource } from "@/data/hr-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { HRPayment, HRPlannedItem } from "@/types/hr";

const HR_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_HR_ITEMS: HRPlannedItem[] = [];
const EMPTY_HR_PAYMENTS: HRPayment[] = [];

export const hrQueryKeys = {
  projectItems: (profileId: string, projectId: string) =>
    ["hr", "project-items", profileId, projectId] as const,
  projectPayments: (profileId: string, projectId: string) =>
    ["hr", "project-payments", profileId, projectId] as const,
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
    return subscribeHR(update);
  }, [enabled, fallback, getter]);

  return enabled ? value : fallback;
}

export function useProjectHRItems(projectId: string): HRPlannedItem[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getItems = useCallback(() => getHRItems(projectId), [projectId]);
  const browserItems = useStoreValue(
    getItems,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_HR_ITEMS,
  );
  const itemsQuery = useQuery({
    queryKey: supabaseMode
      ? hrQueryKeys.projectItems(supabaseMode.profileId, projectId)
      : hrQueryKeys.projectItems("browser", projectId),
    queryFn: async () => {
      const source = await getHRSource(supabaseMode ?? undefined);
      return source.getProjectHRItems(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: HR_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserItems;
  }

  return itemsQuery.data ?? EMPTY_HR_ITEMS;
}

export function useProjectHRPayments(projectId: string): HRPayment[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getPayments = useCallback(() => getHRPayments(projectId), [projectId]);
  const browserPayments = useStoreValue(
    getPayments,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_HR_PAYMENTS,
  );
  const paymentsQuery = useQuery({
    queryKey: supabaseMode
      ? hrQueryKeys.projectPayments(supabaseMode.profileId, projectId)
      : hrQueryKeys.projectPayments("browser", projectId),
    queryFn: async () => {
      const source = await getHRSource(supabaseMode ?? undefined);
      return source.getProjectHRPayments(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: HR_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserPayments;
  }

  return paymentsQuery.data ?? EMPTY_HR_PAYMENTS;
}
