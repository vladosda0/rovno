import { useLocation } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AISidebar() {
  const location = useLocation();
  const isProjectContext = location.pathname.startsWith("/project/");
  const title = isProjectContext ? "Project AI" : "Global AI";

  return (
    <Sidebar collapsible="icon" className="glass-sidebar border-r-0 top-12 h-[calc(100svh-48px)]">
      <SidebarHeader className="p-sp-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Bot className="h-4 w-4 text-accent" />
          </div>
          <span className="text-body-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {title}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-sp-1 group-data-[collapsible=icon]:hidden">
        <div className="flex flex-1 flex-col items-center justify-center text-center px-sp-2">
          <Bot className="mb-sp-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-body-sm text-muted-foreground">
            {isProjectContext
              ? "Ask about this project — tasks, estimates, documents..."
              : "Create a project, get recommendations, or ask anything."}
          </p>
        </div>
      </SidebarContent>

      <SidebarFooter className="p-sp-1 group-data-[collapsible=icon]:hidden">
        <div className="flex gap-1.5">
          <Input placeholder="Ask AI..." className="h-9 text-body-sm bg-sidebar-accent/50 border-sidebar-border" />
          <Button size="icon" className="h-9 w-9 shrink-0 bg-accent text-accent-foreground hover:bg-accent/90">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
