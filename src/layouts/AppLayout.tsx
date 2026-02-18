import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TopBar } from "@/components/TopBar";
import { AISidebar } from "@/components/AISidebar";

export default function AppLayout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <AISidebar />
        <SidebarInset>
          <TopBar />
          <div className="pt-12">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
