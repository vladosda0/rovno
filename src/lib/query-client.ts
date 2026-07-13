import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { captureException } from "@/lib/observability/sentry";
import { shouldReportDataLayerError } from "@/lib/observability/data-layer-errors";

/**
 * App-wide QueryClient singleton. Lives outside App.tsx so non-React session
 * hygiene (auth identity change → clear all cached account data) can reach it
 * without an import cycle through the component tree.
 */
export const queryClient = new QueryClient({
  // App-wide data-layer error reporting (Sentry). shouldReportDataLayerError
  // filters expected outcomes (aborts, tier-limit paywalls, offline query
  // retries) so this stays a defect signal, not noise.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!shouldReportDataLayerError(error, "query")) return;
      // The queryKey head (resource/RPC name) goes into a TAG so Sentry alert
      // rules can match critical data sources (e.g. search_canonical_library).
      const keyHead = query.queryKey[0];
      captureException(error, {
        tags: {
          source: "react-query",
          kind: "query",
          query_key: typeof keyHead === "string" ? keyHead : "unknown",
        },
        extra: { queryKey: query.queryKey },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!shouldReportDataLayerError(error, "mutation")) return;
      captureException(error, {
        tags: { source: "react-query", kind: "mutation" },
        extra: { mutationKey: mutation.options.mutationKey },
      });
    },
  }),
  defaultOptions: {
    queries: {
      // Disabled app-wide on purpose: alt-tabbing back into a half-filled form (or any page)
      // must not refetch-and-reset it, which was a source of visible reload churn. Freshness is
      // preserved via explicit invalidateQueries after mutations + per-query staleTime/refetchInterval
      // (e.g. payment status and tier quota poll on their own). A query that genuinely needs
      // refresh-on-focus should opt back in locally with refetchOnWindowFocus: true.
      refetchOnWindowFocus: false,
    },
  },
});
