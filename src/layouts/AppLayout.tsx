import { Outlet, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Binoculars, Crown, Handshake, HardHat, PanelLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { subscribePhotoConsult } from "@/lib/photo-consult-store";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { setAnalyticsUserId } from "@/lib/analytics";
import { AuthSimulator } from "@/components/settings/AuthSimulator";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { getAuthRole, subscribeAuthState, type AuthRole } from "@/lib/auth-state";
import {
  readAiSidebarSessionPreference,
  writeAiSidebarSessionPreference,
} from "@/lib/ai-sidebar-session";

const AISidebar = lazy(() =>
  import("@/components/AISidebar").then((module) => ({ default: module.AISidebar })),
);

/** MVP: hide reusable project AI sidebar on `/home` (see architecture contract); code preserved in `AISidebar`. */
const HIDE_AI_ROUTES = ["/settings", "/home"];

function useSimulatedAuthRole(): AuthRole {
  return useSyncExternalStore(subscribeAuthState, getAuthRole, getAuthRole);
}

function DevToolsRoleIcon({ role }: { readonly role: AuthRole }) {
  const className = "h-4 w-4 text-accent";
  switch (role) {
    case "owner":
      return <Crown className={className} aria-hidden />;
    case "co_owner":
      return <Handshake className={className} aria-hidden />;
    case "contractor":
      return <HardHat className={className} aria-hidden />;
    case "viewer":
      return <Binoculars className={className} aria-hidden />;
    case "guest":
      return <Binoculars className={className} aria-hidden />;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

const MOBILE_BREAKPOINT_PX = 768;

export default function AppLayout() {
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(() => {
    const stored = readAiSidebarSessionPreference();
    if (stored !== null) return stored;
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX) return true;
    return false;
  });
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const location = useLocation();

  const hideAi = HIDE_AI_ROUTES.some((r) => location.pathname.startsWith(r));
  const runtimeAuth = useRuntimeAuth();
  const workspaceMode = useWorkspaceMode();
  const simulatedAuthRole = useSimulatedAuthRole();

  const showDevToolsFab = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    return workspaceMode.kind === "local" || workspaceMode.kind === "demo";
  }, [workspaceMode.kind]);

  const devToolsRoleLabel = useMemo(() => {
    switch (simulatedAuthRole) {
      case "owner":
        return "owner";
      case "co_owner":
        return "co-owner";
      case "contractor":
        return "contractor";
      case "viewer":
        return "viewer";
      case "guest":
        return "guest";
      default: {
        const _e: never = simulatedAuthRole;
        return _e;
      }
    }
  }, [simulatedAuthRole]);

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
      />
      <div className="flex flex-1 overflow-x-hidden pt-12">
        {!hideAi && (
          aiSidebarCollapsed ? (
            <div className="sticky top-12 z-20 hidden h-[calc(100svh-48px)] w-12 shrink-0 self-start border-r border-border/60 bg-background/80 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:block">
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

      {showDevToolsFab && (
        <>
          {devToolsOpen ? (
            <div className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-1rem)]">
              <div className="max-h-[70vh] overflow-auto">
                <div className="flex justify-end pb-2">
                  <button
                    type="button"
                    aria-label="Minimize dev tools"
                    onClick={() => setDevToolsOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background hover:bg-accent/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <AuthSimulator />
              </div>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Open dev tools (role: ${devToolsRoleLabel})`}
              title={`Dev tools — simulated role: ${devToolsRoleLabel}`}
              onClick={() => setDevToolsOpen(true)}
              className="fixed bottom-4 right-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/70"
            >
              <DevToolsRoleIcon role={simulatedAuthRole} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
