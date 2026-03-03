import { useCallback, useEffect, useState } from "react";
import {
  findVersionByShareId,
  getEstimateV2ProjectState,
  subscribeEstimateV2,
  type EstimateV2ProjectView,
} from "@/data/estimate-v2-store";
import type { EstimateV2Version } from "@/types/estimate-v2";

export function useEstimateV2Project(projectId: string): EstimateV2ProjectView {
  const getter = useCallback(() => getEstimateV2ProjectState(projectId), [projectId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeEstimateV2(update);
  }, [getter]);

  return value;
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
