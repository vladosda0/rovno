import { Outlet, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
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

const HIDE_AI_ROUTES = ["/settings"];

export default function AppLayout() {
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(() => readAiSidebarSessionPreference() ?? false);
  const location = useLocation();

  const hideAi = HIDE_AI_ROUTES.some((r) => location.pathname.startsWith(r));
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
      />
      <div className="flex flex-1 pt-12">
        {!hideAi && (
          aiSidebarCollapsed ? (
            <div className="sticky top-12 z-20 h-[calc(100svh-48px)] w-12 shrink-0 self-start border-r border-border/60 bg-background/80 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
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
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
