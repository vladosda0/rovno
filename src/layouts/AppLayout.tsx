import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { AISidebar } from "@/components/AISidebar";

const HIDE_AI_ROUTES = ["/settings"];

export default function AppLayout() {
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(false);
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
          <AISidebar
            collapsed={aiSidebarCollapsed}
            onCollapsedChange={setAiSidebarCollapsed}
          />
        )}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
