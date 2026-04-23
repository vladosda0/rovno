import { Link, useLocation, useMatch, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, PanelLeft, Settings, User, UserCog } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectTabs } from "@/components/ProjectTabs";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser, useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import type { AIAccess, FinanceVisibility, MemberRole } from "@/types/entities";
import { addMember, updateMember, type BrowserWorkspaceKind } from "@/data/store";
import { getDefaultFinanceVisibility } from "@/lib/participant-role-policy";

type DemoSwitchableRole = Extract<MemberRole, "owner" | "co_owner" | "contractor" | "viewer">;

function mapDemoRoleToMembership(role: DemoSwitchableRole): {
  aiAccess: AIAccess;
  financeVisibility: FinanceVisibility;
  creditLimit: number;
} {
  switch (role) {
    case "owner":
      return { aiAccess: "project_pool", financeVisibility: getDefaultFinanceVisibility("owner"), creditLimit: 500 };
    case "co_owner":
      return { aiAccess: "project_pool", financeVisibility: getDefaultFinanceVisibility("co_owner"), creditLimit: 500 };
    case "contractor":
      return { aiAccess: "consult_only", financeVisibility: getDefaultFinanceVisibility("contractor"), creditLimit: 100 };
    case "viewer":
      return { aiAccess: "none", financeVisibility: getDefaultFinanceVisibility("viewer"), creditLimit: 0 };
  }
}

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

  const handleRoleChange = (role: DemoSwitchableRole) => {
    if (!projectId || !user.id) {
      setAuthRole(role);
      toast({ title: t("demo.roleChanged") });
      return;
    }
    const membership = mapDemoRoleToMembership(role);
    const mutationMode = (workspaceMode.kind === "demo" || workspaceMode.kind === "local"
      ? workspaceMode.kind
      : "demo") as BrowserWorkspaceKind;
    const updated = updateMember(
      projectId,
      user.id,
      { role, ai_access: membership.aiAccess, finance_visibility: membership.financeVisibility },
      mutationMode,
    );
    if (!updated) {
      addMember({
        project_id: projectId,
        user_id: user.id,
        role,
        ai_access: membership.aiAccess,
        finance_visibility: membership.financeVisibility,
        credit_limit: membership.creditLimit,
        used_credits: 0,
      });
    }
    setAuthRole(role);
    toast({ title: t("demo.roleChanged") });
    window.location.reload();
  };

  const renderRoleSwitcher = () => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <UserCog className="mr-2 h-4 w-4" />
        {t("demo.changeRole")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="glass-elevated rounded-card">
        <DropdownMenuItem onClick={() => handleRoleChange("owner")}>{t("demo.roles.owner")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRoleChange("co_owner")}>{t("demo.roles.co_owner")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRoleChange("contractor")}>{t("demo.roles.contractor")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRoleChange("viewer")}>{t("demo.roles.viewer")}</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
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

  if (isInProject && projectId) {
    return (
      <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center px-3 glass">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-2 px-2 shrink-0">
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
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-2 px-3 glass">
      {isHomePage ? (
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-2 px-2 shrink-0">
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
              <Button variant="ghost" className="h-8 gap-2 px-2 shrink-0">
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
    </header>
  );
}
