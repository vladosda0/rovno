import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { TIER_QUOTA_QUERY_KEY } from "@/hooks/useTierQuota";

// can_start_project_estimate lives in a migration excluded from the backend-truth
// mirror (same family as get_current_usage), so it is called untyped.
const rawSupabase = supabase as unknown as SupabaseClient;

/**
 * Whether an estimate can be started in this project under the OWNER's plan
 * (rovno-db#86). Answers yes/no. `undefined` while unknown or on error.
 */
export function useCanStartProjectEstimate(projectId: string, enabled: boolean) {
  const { status, profileId } = useRuntimeAuth();
  return useQuery({
    // Under the tier-quota prefix, so invalidating TIER_QUOTA_QUERY_KEY refreshes it.
    queryKey: [...TIER_QUOTA_QUERY_KEY, "can-start-estimate", projectId, profileId],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await rawSupabase.rpc("can_start_project_estimate", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: enabled && status === "authenticated" && Boolean(profileId) && Boolean(projectId),
    staleTime: 30_000,
    retry: 1,
  });
}
