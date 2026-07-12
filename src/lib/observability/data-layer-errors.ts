/**
 * Decides whether a React Query error (query/mutation) is worth reporting to
 * Sentry. Central noise gate for the app-wide QueryCache/MutationCache
 * onError hooks in App.tsx — sustainability of alerts depends on it (spec:
 * false-positive P0 alerts < 1/week).
 */

import { parseTierLimitError } from "@/lib/tier-limit-error";

/**
 * Pure client-connectivity failures. `fetch` rejects with a TypeError whose
 * message is browser-specific; these are dominated by users going offline /
 * flaky mobile networks, not by server defects.
 */
const NETWORK_FAILURE_PATTERNS = [
  "failed to fetch", // Chromium
  "load failed", // Safari
  "networkerror when attempting to fetch resource", // Firefox
];

export function isNetworkFetchFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return NETWORK_FAILURE_PATTERNS.some((pattern) => message.includes(pattern));
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Report policy:
 *  - aborts are never defects (navigation / unmount cancellations);
 *  - backend tier-limit errors (P0001) are expected business outcomes with
 *    their own paywall UX, not bugs;
 *  - for background QUERIES, plain network failures are skipped (offline
 *    users would flood Sentry with retries);
 *  - MUTATIONS report everything else including network failures — a user
 *    action that failed to persist is exactly the signal we want.
 */
export function shouldReportDataLayerError(
  error: unknown,
  kind: "query" | "mutation",
): boolean {
  if (isAbortError(error)) return false;
  if (parseTierLimitError(error) !== null) return false;
  if (kind === "query" && isNetworkFetchFailure(error)) return false;
  return true;
}
