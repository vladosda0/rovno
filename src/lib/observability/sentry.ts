/**
 * Error-tracking façade (Sentry) — the ONLY module the app imports for error
 * reporting. The real `@sentry/react` SDK is loaded lazily via dynamic import
 * so it never blocks first render and never lands in the entry chunk; until
 * it arrives, captures are queued and unhandled errors are buffered by two
 * tiny window handlers installed synchronously from `initErrorTracking()`.
 *
 * Fully disabled (zero network, zero SDK bytes requested) when
 * `VITE_SENTRY_DSN` is empty or unset — mirrors how Metrika is gated in
 * src/lib/analytics.ts. Fail-open by design: any failure inside this module
 * must never break the app for the user.
 */

import { scrubEventSafe } from "./scrub";

type SentryLib = typeof import("@sentry/react");

/** Injected by vite.config.ts `define` (git SHA at build time). */
declare const __APP_RELEASE__: string;

export const SENTRY_DSN: string | null = (() => {
  const raw = import.meta.env.VITE_SENTRY_DSN;
  if (raw === undefined || raw === null) return null;
  const trimmed = `${raw}`.trim();
  return trimmed === "" ? null : trimmed;
})();

/** Same source + default as EnvBanner: unset behaves like production. */
const ENVIRONMENT: string = `${import.meta.env.VITE_APP_ENV ?? "production"}`;

const RELEASE: string = typeof __APP_RELEASE__ !== "undefined" ? __APP_RELEASE__ : "unknown";

export interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

type Command = (lib: SentryLib) => void;

const MAX_QUEUED_COMMANDS = 100;
const MAX_BUFFERED_ERRORS = 20;

let sentry: SentryLib | null = null;
let initStarted = false;
let commandQueue: Command[] = [];

const earlyErrorBuffer: unknown[] = [];
let onEarlyError: ((event: ErrorEvent) => void) | null = null;
let onEarlyRejection: ((event: PromiseRejectionEvent) => void) | null = null;

function enqueue(command: Command): void {
  if (sentry) {
    try {
      command(sentry);
    } catch {
      // Fail-open: reporting must never throw into app code.
    }
    return;
  }
  if (commandQueue.length < MAX_QUEUED_COMMANDS) commandQueue.push(command);
}

function installEarlyHandlers(): void {
  onEarlyError = (event: ErrorEvent) => {
    if (earlyErrorBuffer.length < MAX_BUFFERED_ERRORS) {
      earlyErrorBuffer.push(event.error ?? event.message);
    }
  };
  onEarlyRejection = (event: PromiseRejectionEvent) => {
    if (earlyErrorBuffer.length < MAX_BUFFERED_ERRORS) {
      earlyErrorBuffer.push(event.reason);
    }
  };
  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);
}

function removeEarlyHandlers(): void {
  if (onEarlyError) window.removeEventListener("error", onEarlyError);
  if (onEarlyRejection) window.removeEventListener("unhandledrejection", onEarlyRejection);
  onEarlyError = null;
  onEarlyRejection = null;
}

/**
 * Kick off error tracking. Called once from main.tsx BEFORE render; returns
 * immediately (the SDK chunk downloads in parallel with the app rendering).
 * No-op without a DSN.
 */
export function initErrorTracking(): void {
  if (!SENTRY_DSN) return;
  if (typeof window === "undefined") return;
  if (initStarted) return;
  initStarted = true;

  // Catch errors thrown before the SDK chunk arrives; replayed after init.
  installEarlyHandlers();

  void import("@sentry/react")
    .then((lib) => {
      lib.init({
        dsn: SENTRY_DSN,
        environment: ENVIRONMENT,
        release: RELEASE,
        // Errors only for v1 — no tracing, no replay (cost + 152-ФЗ).
        sendDefaultPii: false,
        // PostgREST / edge-function error messages carry useful detail past
        // Sentry's 250-char default.
        maxValueLength: 1000,
        beforeSend: (event) =>
          scrubEventSafe(event as unknown as Record<string, unknown>) as typeof event | null,
        ignoreErrors: [
          // Benign browser noise, standard Sentry hygiene.
          "ResizeObserver loop limit exceeded",
          "ResizeObserver loop completed with undelivered notifications",
        ],
      });
      lib.setTag("app", "rovno-frontend");
      sentry = lib;

      // Same synchronous block: replay buffered early errors, then hand
      // global handling over to the SDK's own hooks (installed by init).
      removeEarlyHandlers();
      for (const buffered of earlyErrorBuffer.splice(0)) {
        try {
          lib.captureException(buffered);
        } catch {
          // Fail-open.
        }
      }
      const queued = commandQueue;
      commandQueue = [];
      for (const command of queued) {
        try {
          command(lib);
        } catch {
          // Fail-open.
        }
      }
    })
    .catch(() => {
      // SDK chunk failed to load (offline, adblock). Product keeps working.
      removeEarlyHandlers();
      earlyErrorBuffer.length = 0;
      commandQueue = [];
    });
}

/** Tag every subsequent event with the (pseudonymous) user id, or clear it. */
export function setSentryUser(userId: string | null): void {
  if (!SENTRY_DSN) return;
  enqueue((lib) => lib.setUser(userId ? { id: userId } : null));
}

/** Report a handled exception. Safe to call any time, even before init. */
export function captureException(error: unknown, context?: CaptureContext): void {
  if (!SENTRY_DSN) {
    if (import.meta.env.DEV) {
      // Local visibility so instrumented paths are debuggable without a DSN.
      console.warn("[observability] captureException (reporting disabled):", error, context);
    }
    return;
  }
  enqueue((lib) => lib.captureException(error, { tags: context?.tags, extra: context?.extra }));
}

/** Report a message-level event (no exception object). */
export function captureMessage(message: string, context?: CaptureContext): void {
  if (!SENTRY_DSN) {
    if (import.meta.env.DEV) {
      console.warn("[observability] captureMessage (reporting disabled):", message, context);
    }
    return;
  }
  enqueue((lib) =>
    lib.captureMessage(message, {
      level: "error",
      tags: context?.tags,
      extra: context?.extra,
    }),
  );
}
