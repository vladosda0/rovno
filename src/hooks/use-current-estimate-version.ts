import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const rawSupabase = supabase as unknown as SupabaseClient;

/**
 * Resolves the server-side current estimate_version_id for a project (needed by
 * the apply RPCs). Done as an on-demand query rather than threading it through
 * the client estimate view.
 */
export function useCurrentEstimateVersionId(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["current_estimate_version_id", projectId ?? null],
    enabled: Boolean(projectId) && enabled,
    queryFn: async (): Promise<string | null> => {
      const { data: estimate, error: estimateError } = await rawSupabase
        .from("project_estimates")
        .select("id")
        .eq("project_id", projectId)
        .limit(1)
        .maybeSingle();
      if (estimateError) throw estimateError;
      if (!estimate) return null;
      const { data: version, error: versionError } = await rawSupabase
        .from("estimate_versions")
        .select("id")
        .eq("estimate_id", (estimate as { id: string }).id)
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();
      if (versionError) throw versionError;
      return version ? (version as { id: string }).id : null;
    },
    staleTime: 60 * 1000,
  });
}
