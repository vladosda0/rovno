import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  getHRItems,
  getHRPayments,
  subscribeHR,
} from "@/data/hr-store";
import {
  createProjectHRPayment as createProjectHRPaymentSource,
  getHRSource,
  setProjectHRAssignees as setProjectHRAssigneesSource,
  setProjectHRItemStatus as setProjectHRItemStatusSource,
} from "@/data/hr-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { HRItemStatus, HRPayment, HRPlannedItem } from "@/types/hr";

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

  const invalidateProjectItems = useCallback(async (resolvedMode: Extract<typeof mode, { kind: "supabase" }>) => {
    await queryClient.invalidateQueries({
      queryKey: hrQueryKeys.projectItems(resolvedMode.profileId, projectId),
    });
  }, [projectId, queryClient]);

  const invalidateProjectPayments = useCallback(async (resolvedMode: Extract<typeof mode, { kind: "supabase" }>) => {
    await queryClient.invalidateQueries({
      queryKey: hrQueryKeys.projectPayments(resolvedMode.profileId, projectId),
    });
  }, [projectId, queryClient]);

  const setAssignees = useCallback(async (hrItemId: string, assigneeIds: string[]) => {
    const resolvedMode = assertHRMutationWorkspaceMode(mode);
    const currentItems = queryClient.getQueryData(hrQueryKeys.projectItems(resolvedMode.profileId, projectId)) || [];
    const currentItem = currentItems.find(item => item.id === hrItemId);
    const previousAssigneeIds = currentItem?.assigneeIds || [];

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
  }, [invalidateProjectItems, mode, projectId, queryClient]);

  const setItemStatus = useCallback(async (hrItemId: string, status: HRItemStatus) => {
    const resolvedMode = assertHRMutationWorkspaceMode(mode);
    const currentItems = queryClient.getQueryData(hrQueryKeys.projectItems(resolvedMode.profileId, projectId)) || [];
    const currentItem = currentItems.find(item => item.id === hrItemId);
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
      item_title: currentItem?.title,
    });

    if (resolvedMode.kind === "supabase") {
      await invalidateProjectItems(resolvedMode);
    }
  }, [invalidateProjectItems, mode, projectId, queryClient]);

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
      payment_status: payment.status,
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
