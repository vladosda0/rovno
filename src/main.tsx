import { createRoot } from "react-dom/client";
import "@/i18n";
import App from "./App.tsx";
import "./index.css";
import { initMetrika } from "@/lib/analytics";
import { initErrorTracking } from "@/lib/observability/sentry";
import { installPreloadErrorRecovery } from "@/lib/observability/preload-recovery";
import { installStylesheetGuard } from "@/lib/observability/stylesheet-guard";
import { RootErrorBoundary } from "@/components/system/RootErrorBoundary";
import { capturePrerenderSnapshot } from "@/lib/prerender-snapshot";

// Non-blocking: registers early error handlers synchronously, then loads the
// Sentry SDK chunk in parallel with the app render. No-op without a DSN.
initErrorTracking();
// Before the router mounts any lazy route: a chunk that fails to preload gets
// one reload instead of dropping the page into RootErrorBoundary.
installPreloadErrorRecovery();
// The other half of the same failure: a stylesheet the host answered with
// index.html loads "successfully" and silently renders the page unstyled, so it
// never reaches the handler above. Shares its one-reload-per-window budget.
installStylesheetGuard({
  reload: () => window.location.reload(),
  suppressReload: import.meta.env.DEV,
});
initMetrika();
// Before createRoot() wipes it: the route fallback repaints the prerendered
// public page while its chunk loads (src/lib/prerender-snapshot.ts).
capturePrerenderSnapshot();

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
