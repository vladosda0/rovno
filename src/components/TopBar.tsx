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
import { PanelLeft } from "lucide-react";
import { useCurrentUser, useNotifications } from "@/hooks/use-mock-data";

export function TopBar() {
  const location = useLocation();
  const isInProject = location.pathname.startsWith("/project/");
  const user = useCurrentUser();
  const { unreadCount } = useNotifications();
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-2 px-3 glass">
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <PanelLeft className="h-4 w-4" />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>

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

      <Button variant="ghost" size="icon" className="relative h-8 w-8">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
            {unreadCount}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-caption bg-accent text-accent-foreground">{initials}</AvatarFallback>
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
