import { Outlet, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { subscribePhotoConsult } from "@/lib/photo-consult-store";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { setAnalyticsUserId } from "@/lib/analytics";
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
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(() => {
    const stored = readAiSidebarSessionPreference();
    if (stored !== null) return stored;
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX) return true;
    return false;
  });
  const location = useLocation();

  const hideAi = !location.pathname.startsWith(AI_SIDEBAR_ROUTE_PREFIX);
  const runtimeAuth = useRuntimeAuth();

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
    } else {
      setAnalyticsUserId(null);
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
      {/* TopBar is position:fixed at top: var(--env-banner-h, 0px); the env
          banner is itself in flow above this wrapper, so we only need to
          reserve the TopBar height (3rem) here. The previous pt-calc summed
          both heights and produced a visible empty band. */}
      <div className="flex flex-1 pt-12">
        {!hideAi && (
          aiSidebarCollapsed ? (
            <div
              className="sticky z-20 hidden h-[calc(100svh-48px-var(--env-banner-h,0px))] w-12 shrink-0 self-start border-r border-border/60 bg-background/80 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:block"
              style={{ top: "calc(3rem + var(--env-banner-h, 0px))" }}
            >
              <button
                type="button"
                onClick={() => setSidebarCollapsedByUser(false)}
                className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <PanelLeft className="h-4 w-4 text-accent" />
                <span className="sr-only">Open AI sidebar</span>
              </button>
            </div>
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
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
