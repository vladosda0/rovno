import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, LogOut, Settings, Sparkles, UserCog } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useVisibleProjectTabs } from "@/components/ProjectTabs";
import { cn } from "@/lib/utils";

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId?: string;
  hideAi: boolean;
  aiSidebarOpen: boolean;
  onSetAiSidebarOpen?: (open: boolean) => void;
  onOpenRoleDialog: () => void;
  onLogout: () => void;
}

const ROW_BASE =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-body-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60";
const ROW_ACTIVE = "bg-accent/10 text-accent";
const SECTION_LABEL =
  "px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function MobileNavSheet({
  open,
  onOpenChange,
  projectId,
  hideAi,
  aiSidebarOpen,
  onSetAiSidebarOpen,
  onOpenRoleDialog,
  onLogout,
}: MobileNavSheetProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const projects = useProjects();
  const workspaceMode = useWorkspaceMode();
  const showRoleSwitcher = workspaceMode.kind === "demo" || workspaceMode.kind === "local";

  const visibleProjectTabs = useVisibleProjectTabs(projectId);
  const inProject = Boolean(projectId);

  const close = () => onOpenChange(false);

  const isHome = location.pathname === "/home" || location.pathname.startsWith("/home/");
  const isSettings = location.pathname.startsWith("/settings");
  const projectPathPrefix = projectId ? `/project/${projectId}/` : "";
  const activeProjectPath = projectId
    ? visibleProjectTabs.find((tab) => location.pathname.startsWith(`${projectPathPrefix}${tab.path}`))?.path
    : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[80vw] max-w-sm flex-col gap-0 p-0"
      >
        <SheetHeader className="flex flex-row items-center gap-2 border-b border-border px-sp-3 py-sp-2 text-left">
          <img src="/logo.svg" alt={t("nav.appName")} className="h-7 w-auto" />
          <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-sp-2 py-sp-2">
          <nav className="flex flex-col gap-0.5">
            <Link
              to="/home"
              onClick={close}
              className={cn(ROW_BASE, isHome && ROW_ACTIVE)}
            >
              <Home className="h-4 w-4" />
              <span>{t("nav.home")}</span>
            </Link>

            {inProject && visibleProjectTabs.map((tab) => {
              const isActive = !aiSidebarOpen && tab.path === activeProjectPath;
              return (
                <Link
                  key={tab.path}
                  to={`/project/${projectId}/${tab.path}`}
                  onClick={() => {
                    if (aiSidebarOpen && onSetAiSidebarOpen) onSetAiSidebarOpen(false);
                    close();
                  }}
                  className={cn(ROW_BASE, isActive && ROW_ACTIVE)}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{t(tab.labelKey)}</span>
                </Link>
              );
            })}

            {inProject && !hideAi && onSetAiSidebarOpen ? (
              <button
                type="button"
                onClick={() => {
                  onSetAiSidebarOpen(true);
                  close();
                }}
                className={cn(ROW_BASE, "w-full text-left", aiSidebarOpen && ROW_ACTIVE)}
              >
                <Sparkles className="h-4 w-4" />
                <span>{t("projectTabs.ai")}</span>
              </button>
            ) : null}

            <Link
              to="/settings"
              onClick={close}
              className={cn(ROW_BASE, isSettings && ROW_ACTIVE)}
            >
              <Settings className="h-4 w-4" />
              <span>{t("nav.settings")}</span>
            </Link>

            {showRoleSwitcher ? (
              <button
                type="button"
                onClick={() => {
                  onOpenRoleDialog();
                  close();
                }}
                className={cn(ROW_BASE, "w-full text-left")}
              >
                <UserCog className="h-4 w-4" />
                <span>{t("demo.changeRole")}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
              className={cn(ROW_BASE, "w-full text-left")}
            >
              <LogOut className="h-4 w-4" />
              <span>{t("nav.logout")}</span>
            </button>
          </nav>

          {projects.length > 0 && (
            <>
              <div className={SECTION_LABEL}>{t("nav.projectsHeader")}</div>
              <nav className="flex flex-col gap-0.5">
                {projects.map((project) => {
                  const isCurrent = project.id === projectId;
                  return (
                    <Link
                      key={project.id}
                      to={`/project/${project.id}/dashboard`}
                      onClick={close}
                      className={cn(ROW_BASE, isCurrent && ROW_ACTIVE)}
                    >
                      <span className="truncate">{project.title}</span>
                    </Link>
                  );
                })}
              </nav>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
