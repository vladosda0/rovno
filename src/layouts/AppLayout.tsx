import { Outlet } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { AISidebar } from "@/components/AISidebar";

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <TopBar />
      <div className="flex flex-1 pt-12">
        <AISidebar />
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
