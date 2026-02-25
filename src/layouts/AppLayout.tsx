import { Outlet } from "react-router-dom";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { AISidebar } from "@/components/AISidebar";

export default function AppLayout() {
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(false);

  return (
    <div className="flex flex-col min-h-screen w-full">
      <TopBar
        aiSidebarCollapsed={aiSidebarCollapsed}
        onToggleAiSidebar={() => setAiSidebarCollapsed((prev) => !prev)}
      />
      <div className="flex flex-1 pt-12">
        <AISidebar
          collapsed={aiSidebarCollapsed}
          onCollapsedChange={setAiSidebarCollapsed}
        />
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
