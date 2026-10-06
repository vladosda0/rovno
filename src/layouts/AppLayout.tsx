import { Outlet, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { Shurik } from "@/components/ai/Shurik";
import { DemoSignupCta } from "@/components/system/DemoSignupCta";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { subscribePhotoConsult } from "@/lib/photo-consult-store";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { setAnalyticsUserId } from "@/lib/analytics";
import { setSentryUser } from "@/lib/observability/sentry";
import {
  readAiSidebarSessionPreference,
  writeAiSidebarSessionPreference,
} from "@/lib/ai-sidebar-session";

const AISidebar = lazy(() =>
  import("@/components/AISidebar").then((module) => ({ default: module.AISidebar })),
);

/**
 * The project AI sidebar appears ONLY on project pages (`/project/:id/...`).
 * Every other AppLayout route — Home, Settings, Profile, Demo, and the full
 * T-Bank billing flow (checkout / success / fail) — renders full-width without
 * it. Matched by pathname prefix, so query strings are irrelevant. Code
 * preserved in `AISidebar`.
 */
const AI_SIDEBAR_ROUTE_PREFIX = "/project/";

const MOBILE_BREAKPOINT_PX = 768;

export default function AppLayout() {
  const { t } = useTranslation();
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(() => {
    const stored = readAiSidebarSessionPreference();
    if (stored !== null) return stored;
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX) return true;
    return false;
  });
  const location = useLocation();

  const hideAi = !location.pathname.startsWith(AI_SIDEBAR_ROUTE_PREFIX);
  const runtimeAuth = useRuntimeAuth();
  const workspaceMode = useWorkspaceMode();
  const isDemo = workspaceMode.kind === "demo";

  useEffect(() => {
    return subscribePhotoConsult(({ context }) => {
      if (context && !hideAi) {
        setAiSidebarCollapsed(false);
      }
    });
  }, [hideAi]);

  useEffect(() => {
    if (runtimeAuth.status === "authenticated") {
      setAnalyticsUserId(runtimeAuth.profileId);
      setSentryUser(runtimeAuth.profileId);
    } else {
      setAnalyticsUserId(null);
      setSentryUser(null);
    }
  }, [runtimeAuth.status, runtimeAuth.profileId]);

  const setSidebarCollapsedByUser = (collapsed: boolean) => {
    setAiSidebarCollapsed(collapsed);
    writeAiSidebarSessionPreference(collapsed);
  };

  return (
    <div className="flex flex-col min-h-screen w-full">
      <TopBar
        aiSidebarCollapsed={hideAi ? true : aiSidebarCollapsed}
        onToggleAiSidebar={() => {
          if (!hideAi) setSidebarCollapsedByUser(!aiSidebarCollapsed);
        }}
        onSetAiSidebarOpen={(open) => {
          if (!hideAi) setSidebarCollapsedByUser(!open);
        }}
        hideAi={hideAi}
      />
      {/* pt reserves the fixed TopBar (3rem) plus the demo strip when a demo
          session is active (--demo-banner-h is 0px otherwise). */}
      <div className="flex flex-1 pt-[calc(3rem+var(--demo-banner-h,0px))]">
        {!hideAi && (
          aiSidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsedByUser(false)}
              aria-label={t("ai.shurik.open")}
              title={t("ai.shurik.open")}
              className="fixed bottom-4 left-4 z-30 hidden rounded-xl drop-shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:block"
            >
              <Shurik motion="idle" decorative />
            </button>
          ) : (
            <Suspense fallback={<div className="w-[420px] max-w-[45vw] shrink-0" />}>
              <AISidebar
                collapsed={aiSidebarCollapsed}
                onCollapsedChange={setSidebarCollapsedByUser}
              />
            </Suspense>
          )
        )}
        <main
          className={cn(
            "flex-1 min-w-0",
            !aiSidebarCollapsed && !hideAi && "hidden md:block",
            aiSidebarCollapsed && !hideAi && "md:pb-24",
          )}
        >
          <Outlet />
          {/* Demo→signup bridge at the bottom of EVERY demo page: one layout-
              level mount instead of a copy in each of the ~16 tab screens. */}
          {isDemo && <DemoSignupCta />}
        </main>
      </div>
      {/* Observability v1 (R-8): fixed feedback entry point on every
          authenticated page; renders nothing for guests. */}
      <FeedbackWidget />
    </div>
  );
}
