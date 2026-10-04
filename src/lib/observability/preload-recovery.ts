import { isOptionalImportPending } from "@/lib/observability/optional-import";
import { captureMessage } from "@/lib/observability/sentry";

/**
 * Recovery for a failed dynamic import.
 *
 * Vite dispatches a cancelable `vite:preloadError` when a dynamic import or
 * one of its preloaded dependencies fails, and rethrows unless the default is
 * prevented. For a lazy route that rejection reaches RootErrorBoundary. The
 * usual causes are a tab that outlived a deploy and a transient network loss;
 * re-requesting the document cures both, so the handler reloads.
 *
 * The reload is capped at ONE per RELOAD_COOLDOWN_MS so a permanently broken
 * asset cannot loop: a second failure inside the window is left to the error
 * boundary and its manual reload button. A window rather than a per-session
 * flag, because sessionStorage lives as long as the tab and a flag would leave
 * a tab that recovered from one release with nothing to spend on the next.
 *
 * ./stylesheet-guard.ts spends the same budget through `attemptRecoveryReload`
 * for the failure this event never reports. Imports wrapped in
 * ./optional-import.ts are left to their callers.
 */

/** sessionStorage key. A record younger than the cooldown is the "retry already spent" guard. */
const SESSION_KEY = "rovno.preloadRecovery";

const RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Which detector spent the reload. Only affects the wording of the deferred
 * Sentry message: the two failures have different causes and want to be told
 * apart in the weekly digest, even though they share one budget.
 */
export type RecoveryKind = "preload" | "stylesheet";

interface RecoveryRecord {
  /** Vite's error message, which carries the asset URL that failed. */
  reason: string;
  /** ISO timestamp of the reload attempt. */
  at: string;
  /** True once the deferred Sentry report has gone out. */
  reported: boolean;
  /** Anything unrecognised reads back as "preload". */
  kind: RecoveryKind;
}

const RECOVERY_MESSAGES: Record<RecoveryKind, string> = {
  preload: "Recovered from a Vite preload failure by reloading",
  stylesheet: "Recovered from a stylesheet served as non-CSS by reloading",
};

function parseKind(value: unknown): RecoveryKind {
  return value === "stylesheet" ? "stylesheet" : "preload";
}

/** `vite:preloadError` is a plain Event with the rejection hung off `payload`. */
interface VitePreloadErrorEvent extends Event {
  payload?: unknown;
}

function readRecord(): RecoveryRecord | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    // Storage disabled (private mode, blocked cookies). Treated as "no record"
    // by the reader and as "cannot guard" by the writer, which is what stops
    // the reload loop below.
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { reason, at, reported, kind } = parsed as Record<string, unknown>;
    if (typeof reason !== "string" || typeof at !== "string") return null;
    return { reason, at, reported: reported === true, kind: parseKind(kind) };
  } catch {
    return null;
  }
}

/** Returns false when the record could not be persisted. */
function writeRecord(record: RecoveryRecord): boolean {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Kept as the whole message rather than a URL parsed out of it: the message is
 * the only place Vite puts the failing asset, and its wording differs between
 * the CSS branch and the module branch.
 */
function describeFailure(payload: unknown): string {
  if (payload instanceof Error && payload.message) return payload.message;
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  return "unknown preload failure";
}

export interface PreloadErrorHandlerOptions {
  /** Injected so tests never hit jsdom's unimplemented navigation. */
  reload: () => void;
  /** True in dev: a broken dev server must stay inspectable, not reload. */
  suppressReload: boolean;
}

/**
 * False only when the last reload is provably older than the cooldown. An
 * unreadable or future timestamp keeps the budget spent: with no trustworthy
 * clock reading there is no loop guard.
 */
function isBudgetSpent(record: RecoveryRecord): boolean {
  const elapsed = Date.now() - Date.parse(record.at);
  return !(elapsed >= RELOAD_COOLDOWN_MS);
}

/**
 * Spend the window's single reload, or decline.
 *
 * The one place that owns the budget, so every detector competes for the same
 * one reload. Returns true only when a reload was actually triggered, which is
 * what lets a caller fall back to its own honest-failure path.
 */
export function attemptRecoveryReload(
  kind: RecoveryKind,
  reason: string,
  options: PreloadErrorHandlerOptions,
): boolean {
  if (options.suppressReload) {
    console.warn(`[${kind}] ${reason} — automatic reload suppressed in dev`);
    return false;
  }

  const previous = readRecord();
  if (previous && isBudgetSpent(previous)) return false;

  // No storage means no loop guard, and an unguarded reload on a
  // permanently broken asset is worse than the error screen.
  if (!writeRecord({ kind, reason, at: new Date().toISOString(), reported: false })) {
    return false;
  }

  options.reload();
  return true;
}

export function createPreloadErrorHandler(
  options: PreloadErrorHandlerOptions,
): (event: Event) => void {
  return (event: Event) => {
    const reason = describeFailure((event as VitePreloadErrorEvent).payload);

    // Deliberately NO event.preventDefault(). Preventing it would let the
    // helper continue into the module import and render the route with a
    // missing stylesheet; letting it throw means that if the reload does not
    // land we show an honest error screen instead of a silently broken page.

    // A reload while offline swaps the app's own error screen for the
    // browser's, and spends the budget on a request that cannot succeed.
    if (window.navigator.onLine === false) return;

    if (isOptionalImportPending()) return;

    attemptRecoveryReload("preload", reason, options);
  };
}

/**
 * Reports a reload that already happened. Deliberately deferred to the next
 * load: the Sentry SDK is a lazy chunk, so anything captured in the handler
 * would still be queued when the reload throws the page away.
 */
export function reportDeferredRecovery(): void {
  const record = readRecord();
  if (!record || record.reported) return;

  // Marked before reporting, so a throw inside capture cannot double-report.
  writeRecord({ ...record, reported: true });

  captureMessage(RECOVERY_MESSAGES[record.kind], {
    tags: { source: "preload-recovery", recoveryKind: record.kind },
    extra: { reason: record.reason, attemptedAt: record.at },
  });
}

/** Call once at boot, before the router mounts any lazy route. */
export function installPreloadErrorRecovery(): void {
  if (typeof window === "undefined") return;

  reportDeferredRecovery();

  window.addEventListener(
    "vite:preloadError",
    createPreloadErrorHandler({
      reload: () => window.location.reload(),
      suppressReload: import.meta.env.DEV,
    }) as EventListener,
  );
}
