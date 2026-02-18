import { Link, useLocation } from "react-router-dom";
import { Bell, ChevronRight, LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function TopBar() {
  const location = useLocation();
  const isInProject = location.pathname.startsWith("/project/");

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-2 px-3 glass">
      {/* Sidebar toggle */}
      <SidebarTrigger className="h-7 w-7" />

      {/* Logo / Breadcrumb */}
      <div className="flex items-center gap-1.5">
        <Link to="/home" className="text-body font-semibold text-foreground hover:text-foreground/80 transition-colors">
          СтройАгент
        </Link>
        {isInProject && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-body-sm text-muted-foreground">Demo Project</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative h-8 w-8">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
        <span className="sr-only">Notifications</span>
      </Button>

      {/* Avatar menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-caption bg-accent text-accent-foreground">SA</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 glass-elevated rounded-card">
          <DropdownMenuItem asChild>
            <Link to="/profile"><User className="mr-2 h-4 w-4" />Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings"><Settings className="mr-2 h-4 w-4" />Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <LogOut className="mr-2 h-4 w-4" />Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
