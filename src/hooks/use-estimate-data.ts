import { useState, useEffect, useCallback } from "react";
import {
  getStageEstimateItems,
  subscribeEstimate,
  type StageEstimateItem,
} from "@/data/estimate-store";

export function useStageEstimateItems(projectId: string): StageEstimateItem[] {
  const getter = useCallback(() => getStageEstimateItems(projectId), [projectId]);
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return subscribeEstimate(update);
  }, [getter]);

  return value;
}
