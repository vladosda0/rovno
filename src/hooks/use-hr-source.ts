import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  getHRItems,
  getHRPayments,
  HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE,
  isHRAssigneeManagedInEstimate,
  subscribeHR,
} from "@/data/hr-store";
import {
  createProjectHRPayment as createProjectHRPaymentSource,
  getHRSource,
  setProjectHRAssignees as setProjectHRAssigneesSource,
  setProjectHRItemStatus as setProjectHRItemStatusSource,
} from "@/data/hr-source";
import { useEstimateV2ProjectSync } from "@/hooks/use-estimate-v2-data";
import { useProjectionAdvance } from "@/hooks/use-projection-advance";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import {
  getProjectDomainAccess,
  projectDomainAllowsView,
  resolveFinanceRowLoadAccess,
  usePermission,
} from "@/lib/permissions";
import type { FinanceRowLoadAccess } from "@/lib/permissions";
import type { HRItemStatus, HRPayment, HRPlannedItem } from "@/types/hr";

const HR_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_HR_ITEMS: HRPlannedItem[] = [];
const EMPTY_HR_PAYMENTS: HRPayment[] = [];

interface HRQueryOptions {
  enabled?: boolean;
}

const hrProjectItemsQueryRoot = (profileId: string, projectId: string) =>
  ["hr", "project-items", profileId, projectId] as const;

export const hrQueryKeys = {
  projectItems: (profileId: string, projectId: string, financeAccess: FinanceRowLoadAccess = "full") =>
    [...hrProjectItemsQueryRoot(profileId, projectId), financeAccess] as const,
  projectItemsRoot: hrProjectItemsQueryRoot,
  projectPayments: (profileId: string, projectId: string) =>
    ["hr", "project-payments", profileId, projectId] as const,
};

function readCachedSupabaseHRItem(
  queryClient: QueryClient,
  profileId: string,
  projectId: string,
  financeAccess: FinanceRowLoadAccess,
  hrItemId: string,
): HRPlannedItem | undefined {
  const key = hrQueryKeys.projectItems(profileId, projectId, financeAccess);
  return queryClient.getQueryData<HRPlannedItem[]>(key)?.find((item) => item.id === hrItemId);
}

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

export interface ProjectHRItemsState {
  items: HRPlannedItem[];
  /** True while permissions or the items query are still resolving. */
  isLoading: boolean;
  /** False when the HR domain is hidden for this role — "no access", not "no items". */
  readsEnabled: boolean;
}

export function useProjectHRItemsState(projectId: string, options?: HRQueryOptions): ProjectHRItemsState {
  const mode = useWorkspaceMode();
  const estimateSync = useEstimateV2ProjectSync(projectId);
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const { seam, isLoading: isPermissionLoading } = usePermission(projectId);
  const financeAccess = useMemo(() => resolveFinanceRowLoadAccess(seam), [seam]);
  const hrReadsEnabled = useMemo(
    () => projectDomainAllowsView(getProjectDomainAccess(seam, "hr")),
    [seam],
  );
  const queriesEnabled = options?.enabled ?? true;
  const loadsEnabled = queriesEnabled && hrReadsEnabled;
  const getItems = useCallback(() => getHRItems(projectId), [projectId]);
  const browserItems = useStoreValue(
    getItems,
    loadsEnabled && (mode.kind === "demo" || mode.kind === "local"),
    EMPTY_HR_ITEMS,
  );
  // Stable key (no projection-revision segment): a revision-embedding key collapses
  // to `undefined` data on every estimate sync and the list flashes empty. The
  // invalidation effect below covers freshness. Permission-race: while permissions
  // resolve, the seam defaults to viewer/none — don't fetch under that identity.
  const itemsQuery = useQuery({
    queryKey: supabaseMode
      ? hrQueryKeys.projectItems(supabaseMode.profileId, projectId, financeAccess)
      : hrQueryKeys.projectItems("browser", projectId),
    queryFn: async () => {
      const source = await getHRSource(supabaseMode ?? undefined);
      return source.getProjectHRItems(projectId, financeAccess);
    },
    enabled: loadsEnabled && Boolean(supabaseMode && projectId) && !isPermissionLoading,
    staleTime: HR_QUERY_STALE_TIME_MS,
    // Refetch on page entry: an estimate edit on another page can advance the
    // projection while this hook is unmounted; returning within staleTime would
    // otherwise serve the stale cached list. Stable key => background refetch
    // keeps prior rows visible (no empty flash).
    refetchOnMount: "always",
  });

  const queryClient = useQueryClient();
  const projectedRevision = estimateSync.domains.hr.projectedRevision ?? null;
  const invalidateProfileId = supabaseMode?.profileId ?? null;
  useProjectionAdvance(
    invalidateProfileId && projectId ? `${invalidateProfileId}:${projectId}` : null,
    projectedRevision,
    () => {
      if (!invalidateProfileId) return;
      void queryClient.invalidateQueries({
        queryKey: hrQueryKeys.projectItemsRoot(invalidateProfileId, projectId),
      });
    },
  );

  if (mode.kind === "demo" || mode.kind === "local") {
    return { items: browserItems, isLoading: false, readsEnabled: loadsEnabled };
  }

  if (!supabaseMode) {
    return {
      items: EMPTY_HR_ITEMS,
      isLoading: mode.kind === "pending-supabase",
      readsEnabled: loadsEnabled,
    };
  }

  return {
    // Never serve cached rows from before a permission downgrade: with reads
    // disabled the truthful answer is "no access", not the last visible list.
    items: loadsEnabled ? (itemsQuery.data ?? EMPTY_HR_ITEMS) : EMPTY_HR_ITEMS,
    isLoading: isPermissionLoading || (loadsEnabled && itemsQuery.isPending),
    readsEnabled: loadsEnabled,
  };
}

export function useProjectHRItems(projectId: string, options?: HRQueryOptions): HRPlannedItem[] {
  return useProjectHRItemsState(projectId, options).items;
}

export interface ProjectHRPaymentsState {
  payments: HRPayment[];
  isLoading: boolean;
  readsEnabled: boolean;
}

export function useProjectHRPaymentsState(projectId: string, options?: HRQueryOptions): ProjectHRPaymentsState {
  const mode = useWorkspaceMode();
  const estimateSync = useEstimateV2ProjectSync(projectId);
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const { seam, isLoading: isPermissionLoading } = usePermission(projectId);
  const hrReadsEnabled = useMemo(
    () => projectDomainAllowsView(getProjectDomainAccess(seam, "hr")),
    [seam],
  );
  const queriesEnabled = options?.enabled ?? true;
  const loadsEnabled = queriesEnabled && hrReadsEnabled;
  const getPayments = useCallback(() => getHRPayments(projectId), [projectId]);
  const browserPayments = useStoreValue(
    getPayments,
    loadsEnabled && (mode.kind === "demo" || mode.kind === "local"),
    EMPTY_HR_PAYMENTS,
  );
  // Stable key + root invalidation on projection advance (see useProjectHRItemsState).
  const paymentsQuery = useQuery({
    queryKey: supabaseMode
      ? hrQueryKeys.projectPayments(supabaseMode.profileId, projectId)
      : hrQueryKeys.projectPayments("browser", projectId),
    queryFn: async () => {
      const source = await getHRSource(supabaseMode ?? undefined);
      return source.getProjectHRPayments(projectId);
    },
    enabled: loadsEnabled && Boolean(supabaseMode && projectId) && !isPermissionLoading,
    staleTime: HR_QUERY_STALE_TIME_MS,
    // Refetch on page entry: an estimate edit on another page can advance the
    // projection while this hook is unmounted; returning within staleTime would
    // otherwise serve the stale cached list. Stable key => background refetch
    // keeps prior rows visible (no empty flash).
    refetchOnMount: "always",
  });

  const queryClient = useQueryClient();
  const projectedRevision = estimateSync.domains.hr.projectedRevision ?? null;
  const invalidateProfileId = supabaseMode?.profileId ?? null;
  useProjectionAdvance(
    invalidateProfileId && projectId ? `${invalidateProfileId}:${projectId}` : null,
    projectedRevision,
    () => {
      if (!invalidateProfileId) return;
      void queryClient.invalidateQueries({
        queryKey: hrQueryKeys.projectPayments(invalidateProfileId, projectId),
      });
    },
  );

  if (mode.kind === "demo" || mode.kind === "local") {
    return { payments: browserPayments, isLoading: false, readsEnabled: loadsEnabled };
  }

  if (!supabaseMode) {
    return {
      payments: EMPTY_HR_PAYMENTS,
      isLoading: mode.kind === "pending-supabase",
      readsEnabled: loadsEnabled,
    };
  }

  return {
    payments: loadsEnabled ? (paymentsQuery.data ?? EMPTY_HR_PAYMENTS) : EMPTY_HR_PAYMENTS,
    isLoading: isPermissionLoading || (loadsEnabled && paymentsQuery.isPending),
    readsEnabled: loadsEnabled,
  };
}

export function useProjectHRPayments(projectId: string, options?: HRQueryOptions): HRPayment[] {
  return useProjectHRPaymentsState(projectId, options).payments;
}

function assertHRMutationWorkspaceMode(
  mode: ReturnType<typeof useWorkspaceMode>,
) {
  if (mode.kind === "pending-supabase") {
    throw new Error("Supabase session is still loading.");
  }

  if (mode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  return mode;
}

export function useProjectHRMutations(projectId: string) {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const { seam } = usePermission(projectId);
  const financeAccess = useMemo(() => resolveFinanceRowLoadAccess(seam), [seam]);

  const invalidateProjectItems = useCallback(async (resolvedMode: Extract<typeof mode, { kind: "supabase" }>) => {
    await queryClient.invalidateQueries({
      queryKey: hrQueryKeys.projectItemsRoot(resolvedMode.profileId, projectId),
    });
  }, [projectId, queryClient]);

  const invalidateProjectPayments = useCallback(async (resolvedMode: Extract<typeof mode, { kind: "supabase" }>) => {
    await queryClient.invalidateQueries({
      queryKey: hrQueryKeys.projectPayments(resolvedMode.profileId, projectId),
    });
  }, [projectId, queryClient]);

  const setAssignees = useCallback(async (hrItemId: string, assigneeIds: string[]) => {
    const resolvedMode = assertHRMutationWorkspaceMode(mode);

    const existing = resolvedMode.kind === "supabase"
      ? readCachedSupabaseHRItem(
        queryClient,
        resolvedMode.profileId,
        projectId,
        financeAccess,
        hrItemId,
      )
      : getHRItems(projectId).find((item) => item.id === hrItemId);

    if (existing && isHRAssigneeManagedInEstimate(existing)) {
      throw new Error(HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE);
    }

    const previousAssigneeIds = existing?.assigneeIds || [];

    await setProjectHRAssigneesSource(resolvedMode, {
      projectId,
      hrItemId,
      assigneeIds,
    });

    trackEvent("hr_item_assignees_changed", {
      project_id: projectId,
      surface: "hr",
      hr_item_id: hrItemId,
      previous_assignee_ids: previousAssigneeIds,
      new_assignee_ids: assigneeIds,
      count: assigneeIds.length,
    });

    if (resolvedMode.kind === "supabase") {
      await invalidateProjectItems(resolvedMode);
    }
  }, [
    financeAccess,
    invalidateProjectItems,
    mode,
    projectId,
    queryClient,
  ]);

  const setItemStatus = useCallback(async (hrItemId: string, status: HRItemStatus) => {
    const resolvedMode = assertHRMutationWorkspaceMode(mode);
    const currentItem = resolvedMode.kind === "supabase"
      ? readCachedSupabaseHRItem(
        queryClient,
        resolvedMode.profileId,
        projectId,
        financeAccess,
        hrItemId,
      )
      : getHRItems(projectId).find((item) => item.id === hrItemId);
    const previousStatus = currentItem?.status;

    await setProjectHRItemStatusSource(resolvedMode, {
      projectId,
      hrItemId,
      status,
    });

    trackEvent("hr_item_status_changed", {
      project_id: projectId,
      surface: "hr",
      hr_item_id: hrItemId,
      previous_status: previousStatus,
      new_status: status,
      // item_title intentionally omitted: free-text that routinely contains a
      // worker's name (PII / 152-ФЗ). hr_item_id is the safe correlation key.
    });

    if (resolvedMode.kind === "supabase") {
      await invalidateProjectItems(resolvedMode);
    }
  }, [
    financeAccess,
    invalidateProjectItems,
    mode,
    projectId,
    queryClient,
  ]);

  const createPayment = useCallback(async (input: {
    hrItemId: string;
    amount: number;
    paidAt: string;
    note?: string | null;
  }) => {
    const resolvedMode = assertHRMutationWorkspaceMode(mode);
    const payment = await createProjectHRPaymentSource(resolvedMode, {
      projectId,
      hrItemId: input.hrItemId,
      amount: input.amount,
      paidAt: input.paidAt,
      note: input.note,
    });

    trackEvent("hr_payment_created", {
      project_id: projectId,
      surface: "hr",
      hr_item_id: input.hrItemId,
      amount: input.amount,
      paid_at: input.paidAt,
    });

    if (resolvedMode.kind === "supabase") {
      await invalidateProjectPayments(resolvedMode);
    }

    return payment;
  }, [invalidateProjectPayments, mode, projectId]);

  return {
    setAssignees,
    setItemStatus,
    createPayment,
  };
}
