import { useCallback, useEffect, useState } from "react";
import {
  findVersionByShareId,
  getEstimateV2ProjectState,
  hydrateEstimateV2ProjectFromWorkspace,
  subscribeEstimateV2,
  type EstimateV2ProjectSyncState,
  type EstimateV2ProjectView,
} from "@/data/estimate-v2-store";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { EstimateV2Version } from "@/types/estimate-v2";

export const EMPTY_ESTIMATE_V2_PROJECT_SYNC_STATE: EstimateV2ProjectSyncState = {
  estimateRevision: null,
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
