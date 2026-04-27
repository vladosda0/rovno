import { Link, useLocation, useMatch, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, PanelLeft, Settings, User, UserCog } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectTabs } from "@/components/ProjectTabs";
import { MobileNavSheet } from "@/components/MobileNavSheet";
import { AuthSimulator } from "@/components/settings/AuthSimulator";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser, useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";

/** Logo lives on brand blue; ghost default uses hover:bg-accent and hides it — use muted from the same palette. */
const LOGO_MENU_TRIGGER_CLASS =
  "h-8 gap-2 px-2 shrink-0 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground";

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
  onSetAiSidebarOpen?: (open: boolean) => void;
  hideAi?: boolean;
}

const PROJECT_TAB_TITLE_KEYS = new Set([
  "dashboard",
  "estimate",
  "tasks",
  "procurement",
  "hr",
  "gallery",
  "documents",
  "participants",
]);

function derivePageTitle(t: (key: string) => string, pathname: string): string {
  if (pathname === "/home" || pathname.startsWith("/home/")) return t("nav.home");
  if (pathname.startsWith("/settings")) return t("nav.settings");
  const m = pathname.match(/^\/project\/[^/]+\/([^/?#]+)/);
  if (m && PROJECT_TAB_TITLE_KEYS.has(m[1])) return t(`projectTabs.${m[1]}`);
  return "";
}

export function TopBar({ aiSidebarCollapsed, onToggleAiSidebar, onSetAiSidebarOpen, hideAi = false }: TopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const projectMatch = useMatch("/project/:id/*");
  const projectId = projectMatch?.params.id;
  const isInProject = Boolean(projectId);
  const isHomePage = location.pathname === "/home";
  const runtimeAuth = useRuntimeAuth();

  const user = useCurrentUser();
  const projects = useProjects();
  const workspaceMode = useWorkspaceMode();
  const showRoleSwitcher = workspaceMode.kind === "demo" || workspaceMode.kind === "local";
  const currentProject = projects.find((project) => project.id === projectId);
  const projectName = currentProject?.title ?? t("nav.projectFallback");
  const [credits, setCredits] = useState<MockCredits>(DEFAULT_CREDITS);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const displayName = user.name || user.email || (runtimeAuth.status === "authenticated" ? t("nav.displayName.workspace") : t("nav.displayName.guest"));
  const initials = displayName.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();

  const dailyRemaining = Math.max(credits.dailyTotal - credits.dailyUsed, 0);
  const paidRemaining = Math.max(credits.paidTotal - credits.paidUsed, 0);
  const totalRemaining = dailyRemaining + paidRemaining;
  const maxCredits = credits.paidTotal + credits.dailyTotal;
  const paidRemainingPct = maxCredits > 0 ? Math.max((paidRemaining / maxCredits) * 100, 0) : 0;
  const dailyRemainingPct = maxCredits > 0 ? Math.max((dailyRemaining / maxCredits) * 100, 0) : 0;
  const handleCreditsCardClick = () => {
    navigate("/settings?tab=billing");
  };

  const renderRoleSwitcher = () => (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        setRoleDialogOpen(true);
      }}
    >
      <UserCog className="mr-2 h-4 w-4" />
      {t("demo.changeRole")}
    </DropdownMenuItem>
  );

  const renderRoleDialog = () => (
    <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("demo.changeRole")}</DialogTitle>
        </DialogHeader>
        <AuthSimulator />
      </DialogContent>
    </Dialog>
  );

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }

      setCredits(DEFAULT_CREDITS);
      clearDemoSession();
      clearAiSidebarSessionPreference();
      clearStoredAuthProfile();
      setAuthRole("guest");
      toast({ title: t("nav.loggedOutToast") });
      navigate("/");
    } catch (error) {
      toast({
        title: t("nav.logoutFailed"),
        description: error instanceof Error ? error.message : t("nav.logoutGeneric"),
        variant: "destructive",
      });
    }
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pageTitle = derivePageTitle(t, location.pathname);

  const mobileBar = (
    <div className="md:hidden flex flex-1 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setMobileNavOpen(true)}
        className="h-9 w-9 shrink-0 rounded-full"
        aria-label={t("nav.menu")}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="flex-1 truncate text-center text-body-sm font-medium text-foreground">
        {pageTitle}
      </span>
      <div className="h-9 w-9 shrink-0" aria-hidden />
    </div>
  );

  const renderMobileSheet = () => (
    <MobileNavSheet
      open={mobileNavOpen}
      onOpenChange={setMobileNavOpen}
      projectId={projectId}
      hideAi={hideAi}
      aiSidebarOpen={!aiSidebarCollapsed}
      onSetAiSidebarOpen={onSetAiSidebarOpen}
      onOpenRoleDialog={() => setRoleDialogOpen(true)}
      onLogout={handleLogout}
    />
  );

  if (isInProject && projectId) {
    return (
      <>
      <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center px-3 glass">
        <div className="hidden md:flex min-w-0 flex-1 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={LOGO_MENU_TRIGGER_CLASS}>
                <img
                  src="/logo.svg"
                  alt={t("nav.appName")}
                  className="h-6 w-auto"
                />
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
                    <span className="text-caption font-semibold text-foreground">{t("nav.credits")}</span>
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

                  <p className="mt-1.5 text-[11px] text-muted-foreground">{dailyRemaining > 0 ? t("nav.credits.daily") : t("nav.credits.paid")}</p>
                </div>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              {showRoleSwitcher && renderRoleSwitcher()}
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                {t("nav.logout")}
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
              <span className="sr-only">{t("nav.toggleAiSidebar")}</span>
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
        {mobileBar}
      </header>
      {showRoleSwitcher && renderRoleDialog()}
      {renderMobileSheet()}
      </>
    );
  }

  return (
    <>
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-2 px-3 glass">
      <div className="hidden md:flex flex-1 items-center gap-2">
      {isHomePage ? (
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={LOGO_MENU_TRIGGER_CLASS}>
                <img
                  src="/logo.svg"
                  alt={t("nav.appName")}
                  className="h-6 w-auto"
                />
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
                    <span className="text-caption font-semibold text-foreground">{t("nav.credits")}</span>
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

                  <p className="mt-1.5 text-[11px] text-muted-foreground">{dailyRemaining > 0 ? t("nav.credits.daily") : t("nav.credits.paid")}</p>
                </div>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              {showRoleSwitcher && renderRoleSwitcher()}
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!aiSidebarCollapsed && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleAiSidebar}>
              <PanelLeft className="h-4 w-4" />
              <span className="sr-only">{t("nav.toggleSidebar")}</span>
            </Button>
          )}
        </div>
      ) : (
        <>
          {!aiSidebarCollapsed && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleAiSidebar}>
              <PanelLeft className="h-4 w-4" />
              <span className="sr-only">{t("nav.toggleSidebar")}</span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={LOGO_MENU_TRIGGER_CLASS}>
                <img
                  src="/logo.svg"
                  alt={t("nav.appName")}
                  className="h-6 w-auto"
                />
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 glass-elevated rounded-card">
              <DropdownMenuItem asChild>
                <Link to="/home"><User className="mr-2 h-4 w-4" />{t("nav.home")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings"><Settings className="mr-2 h-4 w-4" />{t("nav.settings")}</Link>
              </DropdownMenuItem>
              {showRoleSwitcher && renderRoleSwitcher()}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />{t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <div className="flex-1" />
      </div>
      {mobileBar}
    </header>
    {showRoleSwitcher && renderRoleDialog()}
    {renderMobileSheet()}
    </>
  );
}
