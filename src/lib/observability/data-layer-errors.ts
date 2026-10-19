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

/**
 * `functions.invoke` rejections arrive in this class with the cause in
 * `context`. Matched by class name, not by text: a text match would also
 * catch an unrelated error quoting it.
 */
function isFunctionsFetchError(error: object): boolean {
  return error instanceof Error && error.name === "FunctionsFetchError";
}

export function isNetworkFetchFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (isFunctionsFetchError(error)) return isNetworkFetchFailure((error as { context?: unknown }).context);
  if (!(error instanceof TypeError) && !isPostgrestFetchError(error)) return false;
  const { message } = error as { message?: unknown };
  if (typeof message !== "string") return false;
  const lowered = message.toLowerCase();
  return NETWORK_FAILURE_PATTERNS.some((pattern) => lowered.includes(pattern));
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { name?: unknown }).name === "AbortError") return true;
  // The postgrest-js shape described above carries the name only as a message prefix.
  const { message } = error as { message?: unknown };
  return isPostgrestFetchError(error) && typeof message === "string" && message.startsWith("AbortError: ");
}

/**
 * Refusals a backend function issues by design and names in `code`. The screen
 * that started the call shows the user the reason.
 */
const EXPECTED_REFUSAL_CODES = new Set(["attempt_limit"]);

function isExpectedRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code } = error as { code?: unknown };
  return typeof code === "string" && EXPECTED_REFUSAL_CODES.has(code);
}

/**
 * How long after a sign-out a query dispatched under the old session may still
 * come back refused as anon, its retries included while the tab stays focused
 * and online (React Query pauses retries otherwise).
 */
export const SIGN_OUT_RACE_WINDOW_MS = 60_000;

const ANON_REFUSAL_CODES = new Set(["42501", "PGRST301", "PGRST303"]);

function isSignOutRaceRefusal(error: unknown, signedOutAt: number | null, now: number): boolean {
  if (signedOutAt === null || now < signedOutAt || now - signedOutAt > SIGN_OUT_RACE_WINDOW_MS) return false;
  if (typeof error !== "object" || error === null) return false;
  const { code } = error as { code?: unknown };
  return typeof code === "string" && ANON_REFUSAL_CODES.has(code);
}

/**
 * Report policy:
 *  - aborts are never defects (navigation / unmount cancellations);
 *  - a refusal in EXPECTED_REFUSAL_CODES is a limit doing its job;
 *  - backend tier-limit errors (P0001) are expected business outcomes with
 *    their own paywall UX, not bugs;
 *  - for background QUERIES, plain network failures are skipped (offline
 *    users would flood Sentry with retries);
 *  - for QUERIES, an anon refusal shortly after a sign-out is the old
 *    session's request landing late, not a grant regression;
 *  - MUTATIONS report everything else including network failures — a user
 *    action that failed to persist is exactly the signal we want.
 */
export function shouldReportDataLayerError(
  error: unknown,
  kind: "query" | "mutation",
  { signedOutAt = null, now = Date.now() }: { signedOutAt?: number | null; now?: number } = {},
): boolean {
  if (isAbortError(error)) return false;
  if (parseTierLimitError(error) !== null) return false;
  if (isExpectedRefusal(error)) return false;
  if (kind === "query" && isNetworkFetchFailure(error)) return false;
  if (kind === "query" && isSignOutRaceRefusal(error, signedOutAt, now)) return false;
  return true;
}
