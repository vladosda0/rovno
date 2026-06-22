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
      const { data: estimates, error: estimateError } = await rawSupabase
        .from("project_estimates")
        .select("id")
        .eq("project_id", projectId);
      if (estimateError) throw estimateError;
      const estimateRows = (estimates ?? []) as Array<{ id: string }>;
      if (estimateRows.length === 0) return null;
      // A project must have exactly one estimate root. Surfacing the duplicate (instead of
      // silently taking whichever row PostgREST returns first) keeps a corrupted project
      // from applying a template into an arbitrary root, matching the draft loader's guard.
      if (estimateRows.length > 1) {
        throw new Error(`Multiple estimate roots found for project ${projectId}`);
      }
      const { data: versions, error: versionError } = await rawSupabase
        .from("estimate_versions")
        .select("id")
        .eq("estimate_id", estimateRows[0].id)
        .eq("is_current", true);
      if (versionError) throw versionError;
      const versionRows = (versions ?? []) as Array<{ id: string }>;
      if (versionRows.length > 1) {
        throw new Error(`Multiple current versions found for estimate ${estimateRows[0].id}`);
      }
      return versionRows[0]?.id ?? null;
    },
    staleTime: 60 * 1000,
  });
}
