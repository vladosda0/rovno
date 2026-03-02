import { Outlet, useLocation } from "react-router-dom";
import { Suspense, lazy, useState } from "react";
import { PanelLeft } from "lucide-react";
import { TopBar } from "@/components/TopBar";

const AISidebar = lazy(() =>
  import("@/components/AISidebar").then((module) => ({ default: module.AISidebar })),
);

const HIDE_AI_ROUTES = ["/settings"];

export default function AppLayout() {
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(true);
  const location = useLocation();

  const hideAi = HIDE_AI_ROUTES.some((r) => location.pathname.startsWith(r));

  return (
    <div className="flex flex-col min-h-screen w-full">
      <TopBar
        aiSidebarCollapsed={hideAi ? true : aiSidebarCollapsed}
        onToggleAiSidebar={() => {
          if (!hideAi) setAiSidebarCollapsed((prev) => !prev);
        }}
      />
      <div className="flex flex-1 pt-12">
        {!hideAi && (
          aiSidebarCollapsed ? (
            <div className="w-12 shrink-0 flex items-start justify-center pt-3">
              <button
                type="button"
                onClick={() => setAiSidebarCollapsed(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <PanelLeft className="h-4 w-4 text-accent" />
                <span className="sr-only">Open AI sidebar</span>
              </button>
            </div>
          ) : (
            <Suspense fallback={<div className="w-[420px] max-w-[45vw] shrink-0" />}>
              <AISidebar
                collapsed={aiSidebarCollapsed}
                onCollapsedChange={setAiSidebarCollapsed}
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
