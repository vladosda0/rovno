import { Link, useMatch, useNavigate } from "react-router-dom";
import { ChevronDown, Hammer, LogOut, PanelLeft, Settings, User } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectTabs } from "@/components/ProjectTabs";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser, useProjects } from "@/hooks/use-mock-data";

interface MockCredits {
  dailyTotal: number;
  paidTotal: number;
  dailyUsed: number;
  paidUsed: number;
}

const DEFAULT_CREDITS: MockCredits = {
  dailyTotal: 5,
  paidTotal: 250,
  dailyUsed: 0,
  paidUsed: 0,
};

function consumeCredit(credits: MockCredits, amount = 1): MockCredits {
  const spend = Number.isInteger(amount) && amount > 0 ? amount : 1;
  const dailyRemaining = Math.max(credits.dailyTotal - credits.dailyUsed, 0);
  const paidRemaining = Math.max(credits.paidTotal - credits.paidUsed, 0);

  if (dailyRemaining > 0) {
    return {
      ...credits,
      dailyUsed: Math.min(credits.dailyUsed + spend, credits.dailyTotal),
    };
  }

  if (paidRemaining > 0) {
    return {
      ...credits,
      paidUsed: Math.min(credits.paidUsed + spend, credits.paidTotal),
    };
  }

  return credits;
}

interface TopBarProps {
  aiSidebarCollapsed: boolean;
  onToggleAiSidebar: () => void;
}

export function TopBar({ aiSidebarCollapsed, onToggleAiSidebar }: TopBarProps) {
  const navigate = useNavigate();
  const projectMatch = useMatch("/project/:id/*");
  const projectId = projectMatch?.params.id;
  const isInProject = Boolean(projectId);

  const user = useCurrentUser();
  const projects = useProjects();
  const currentProject = projects.find((project) => project.id === projectId);
  const projectName = currentProject?.title ?? "Demo Project";
  const [credits, setCredits] = useState<MockCredits>(DEFAULT_CREDITS);
  const initials = user.name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();

  const dailyRemaining = Math.max(credits.dailyTotal - credits.dailyUsed, 0);
  const paidRemaining = Math.max(credits.paidTotal - credits.paidUsed, 0);
  const totalRemaining = dailyRemaining + paidRemaining;
  const maxCredits = credits.paidTotal + credits.dailyTotal;
  const paidRemainingPct = maxCredits > 0 ? Math.max((paidRemaining / maxCredits) * 100, 0) : 0;
  const dailyRemainingPct = maxCredits > 0 ? Math.max((dailyRemaining / maxCredits) * 100, 0) : 0;
  const displayName = user.name || "Alex Petrov";

  const handleCreditsCardClick = () => {
    navigate("/settings?tab=billing");
  };

  const handleUseOneCredit = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCredits((prev) => {
      const next = consumeCredit(prev, 1);
      if (next === prev) {
        toast({ title: "No credits left" });
      }
      return next;
    });
  };

  const handleLogout = () => {
    setCredits(DEFAULT_CREDITS);
    toast({ title: "Logged out (demo)" });
  };

  if (isInProject && projectId) {
    return (
      <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center px-3 glass">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-2 px-2 shrink-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-accent via-info to-warning text-accent-foreground">
                  <Hammer className="h-3.5 w-3.5" />
                </span>
                <span className="text-body-sm font-semibold text-foreground">СтройАгент</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 glass-elevated rounded-card">
              <DropdownMenuItem asChild>
                <Link to="/home" className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-caption bg-accent text-accent-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-body-sm font-medium text-foreground">{displayName}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <div className="px-2 py-1.5">
                <div
                  className="rounded-md border border-border bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                  role="button"
                  tabIndex={0}
                  onClick={handleCreditsCardClick}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCreditsCardClick();
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-semibold text-foreground">Credits</span>
                    <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-foreground">
                      {totalRemaining}
                      <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted flex">
                    {credits.paidTotal > 0 && paidRemaining > 0 && (
                      <div className="h-full bg-success/70 transition-all" style={{ width: `${paidRemainingPct}%` }} />
                    )}
                    {dailyRemaining > 0 && (
                      <div className="h-full bg-info/70 transition-all" style={{ width: `${dailyRemainingPct}%` }} />
                    )}
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">{dailyRemaining > 0 ? "Daily credits used" : "Paid credits used"}</p>

                  {import.meta.env.DEV && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={handleUseOneCredit}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        Use 1 credit
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-8 max-w-[240px] justify-start gap-1.5 px-2 min-w-0",
                  projects.length <= 1 && "opacity-60 pointer-events-none",
                )}
                disabled={projects.length <= 1}
              >
                <span className="truncate text-body-sm font-medium text-foreground">{projectName}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 glass-elevated rounded-card">
              {projects.map((project) => (
                <DropdownMenuItem asChild key={project.id}>
                  <Link
                    to={`/project/${project.id}/dashboard`}
                    className={cn(project.id === projectId && "bg-accent/10 text-accent")}
                  >
                    {project.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!aiSidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onToggleAiSidebar}
            >
              <PanelLeft className="h-4 w-4" />
              <span className="sr-only">Toggle AI sidebar</span>
            </Button>
          )}

          <div className="mx-1 h-5 w-px shrink-0 bg-border" />

          <div className="min-w-0 flex-1">
            <ProjectTabs
              projectId={projectId}
              className="border-0 px-0 py-0"
            />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-2 px-3 glass">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleAiSidebar}>
        <PanelLeft className="h-4 w-4" />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>

      <div className="flex items-center gap-1.5">
        <Link to="/home" className="text-body font-semibold text-foreground hover:text-foreground/80 transition-colors">
          СтройАгент
        </Link>
      </div>

      <div className="flex-1" />

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
            <Link to="/home"><User className="mr-2 h-4 w-4" />Home</Link>
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
