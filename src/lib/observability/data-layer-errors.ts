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

/**
 * A PostgREST call does not reject when `fetch` does: while `throwOnError` is
 * unset it resolves with a plain object carrying `message` `"<name>: <msg>"`
 * and an EMPTY `code`. @supabase/postgrest-js 2.97.0, dist/index.mjs:153-193,
 * the `res.catch` branch, where `code` is initialised to `""` and set to
 * nothing else. A server error's `code` is `"42501"`, `"PGRST116"` or absent.
 *
 * The empty `code` is what keeps this narrow. Matching the message alone would
 * also swallow an unrelated defect whose text happens to contain a pattern,
 * and "load failed" is a substring of "upload failed".
 */
function isPostgrestFetchError(error: object): boolean {
  return (error as { code?: unknown }).code === "";
}

export function isNetworkFetchFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!(error instanceof TypeError) && !isPostgrestFetchError(error)) return false;
  const { message } = error as { message?: unknown };
  if (typeof message !== "string") return false;
  const lowered = message.toLowerCase();
  return NETWORK_FAILURE_PATTERNS.some((pattern) => lowered.includes(pattern));
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
