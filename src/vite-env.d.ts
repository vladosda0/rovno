/// <reference types="vite/client" />

/**
 * Git commit SHA injected at build time via `define` in vite.config.ts.
 * "unknown" when built outside a git checkout without VITE_COMMIT_SHA.
 */
declare const __APP_RELEASE__: string;

interface ImportMetaEnv {
  /** Set to `1` or `true` to enable Wave 1 live text assistant (mock client until backend). */
  readonly VITE_AI_LIVE_TEXT_ASSISTANT?: string;
  /** Sentry DSN for error tracking. Empty/unset disables Sentry entirely. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
