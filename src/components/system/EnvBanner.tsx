import { useEffect } from "react";

/**
 * Visible warning strip rendered at the top of every page when the app is NOT
 * running on production. Driven by `VITE_APP_ENV`:
 *
 *   - `production`             — banner is hidden (default for prod build)
 *   - `staging`                — yellow strip, "STAGING — данные могут быть очищены"
 *   - `local` / `development`  — yellow strip, "LOCAL DEV"
 *   - any other / unset value  — yellow strip showing the raw value
 *
 * Also logs the resolved Supabase URL to the browser console once on mount,
 * so DevTools shows where the app is talking to. Helpful when debugging
 * "is this staging or prod?" mid-session.
 *
 * Configure VITE_APP_ENV per environment in:
 *   - Timeweb prod app   → production
 *   - Timeweb staging app → staging
 *   - .env.cloud (local default) → local
 *   - .env.docker / .env.selfhost → local / production (mirrors backend)
 */
export function EnvBanner() {
  const env = import.meta.env.VITE_APP_ENV ?? "production";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "(unset)";

  useEffect(() => {
    // Single-line summary for whoever opens DevTools. Console.info is intentional
    // (sub-warning level so it doesn't trip noise filters in production browsers).
    // eslint-disable-next-line no-console
    console.info(
      `%c[rovno] env=${env} → ${supabaseUrl}`,
      "color:#7c2d12;background:#fef3c7;padding:2px 6px;border-radius:3px;font-weight:600;",
    );
  }, [env, supabaseUrl]);

  // Expose banner height to layout (fixed TopBar / sticky sidebar offset themselves
  // via `var(--env-banner-h, 0px)`). Removed when the banner is hidden.
  useEffect(() => {
    if (env === "production") return;
    document.documentElement.style.setProperty("--env-banner-h", "28px");
    return () => {
      document.documentElement.style.removeProperty("--env-banner-h");
    };
  }, [env]);

  if (env === "production") return null;

  const label =
    env === "staging"
      ? "STAGING — данные могут быть очищены без предупреждения"
      : env === "local" || env === "development"
        ? "LOCAL DEV"
        : `ENV=${env}`;

  // Strip protocol from URL for a tighter display.
  const shortUrl = supabaseUrl.replace(/^https?:\/\//, "");

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-[60] flex h-7 w-full shrink-0 items-center justify-center gap-3 bg-amber-400/95 px-3 text-xs font-medium text-amber-950 select-none"
    >
      <span aria-hidden>⚠</span>
      <span>{label}</span>
      <span className="ml-2 font-mono opacity-70">{shortUrl}</span>
    </div>
  );
}
