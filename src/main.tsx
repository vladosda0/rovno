import { createRoot } from "react-dom/client";
import "@/i18n";
import App from "./App.tsx";
import "./index.css";
import { initMetrika } from "@/lib/analytics";
import { initErrorTracking } from "@/lib/observability/sentry";
import { RootErrorBoundary } from "@/components/system/RootErrorBoundary";

// Non-blocking: registers early error handlers synchronously, then loads the
// Sentry SDK chunk in parallel with the app render. No-op without a DSN.
initErrorTracking();
initMetrika();

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
