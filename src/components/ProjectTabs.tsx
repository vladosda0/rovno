import { NavLink } from "@/components/NavLink";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getProjectDomainAccess,
  projectDomainAllowsView,
  usePermission,
  type ProjectDomain,
} from "@/lib/permissions";
import {
  LayoutDashboard, Calculator, ShoppingCart,
  Image, FileText, Users, HardHat, ListTodo,
  ChevronDown, Sparkles,
} from "lucide-react";

const tabs = [
  { labelKey: "projectTabs.dashboard", path: "dashboard", icon: LayoutDashboard },
  { labelKey: "projectTabs.estimate", path: "estimate", icon: Calculator, domain: "estimate" as ProjectDomain },
  { labelKey: "projectTabs.tasks", path: "tasks", icon: ListTodo, domain: "tasks" as ProjectDomain },
  { labelKey: "projectTabs.procurement", path: "procurement", icon: ShoppingCart, domain: "procurement" as ProjectDomain },
  { labelKey: "projectTabs.hr", path: "hr", icon: HardHat, domain: "hr" as ProjectDomain },
  { labelKey: "projectTabs.gallery", path: "gallery", icon: Image, domain: "gallery" as ProjectDomain },
  { labelKey: "projectTabs.documents", path: "documents", icon: FileText, domain: "documents" as ProjectDomain },
  { labelKey: "projectTabs.participants", path: "participants", icon: Users, domain: "participants" as ProjectDomain },
];

interface ProjectTabsProps {
  className?: string;
  projectId?: string;
  aiSidebarOpen?: boolean;
  onSetAiSidebarOpen?: (open: boolean) => void;
}

export function ProjectTabs({ className, projectId, aiSidebarOpen, onSetAiSidebarOpen }: ProjectTabsProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const resolvedProjectId = projectId ?? id;
  const perm = usePermission(resolvedProjectId ?? "");

  if (!resolvedProjectId) return null;

  const visibleTabs = tabs.filter((tab) => {
    if (!("domain" in tab) || !tab.domain) return true;
    return projectDomainAllowsView(getProjectDomainAccess(perm.seam, tab.domain));
  });

  const projectPathPrefix = `/project/${resolvedProjectId}/`;
  const routeActiveTab =
    visibleTabs.find((tab) => location.pathname.startsWith(`${projectPathPrefix}${tab.path}`))
      ?? visibleTabs[0];

  const aiAsActiveTab = Boolean(aiSidebarOpen && onSetAiSidebarOpen);
  const mobileTriggerIcon = aiAsActiveTab ? Sparkles : routeActiveTab?.icon;
  const mobileTriggerLabel = aiAsActiveTab
    ? t("projectTabs.ai")
    : (routeActiveTab ? t(routeActiveTab.labelKey) : "");

  return (
    <>
      <div className={cn("md:hidden flex items-center border-b border-border px-sp-2 py-1", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-full justify-between gap-1.5 px-2 text-body-sm font-medium text-foreground"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {mobileTriggerIcon
                  ? (() => {
                      const Icon = mobileTriggerIcon;
                      return <Icon className="h-4 w-4 shrink-0 text-accent" />;
                    })()
                  : null}
                <span className="truncate">{mobileTriggerLabel}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(16rem,calc(100vw-1.5rem))] glass-elevated rounded-card">
            {visibleTabs.map((tab) => {
              const isActive = !aiAsActiveTab && tab.path === routeActiveTab?.path;
              return (
                <DropdownMenuItem asChild key={tab.path}>
                  <Link
                    to={`/project/${resolvedProjectId}/${tab.path}`}
                    onClick={() => {
                      if (aiSidebarOpen && onSetAiSidebarOpen) onSetAiSidebarOpen(false);
                    }}
                    className={cn("flex items-center gap-2", isActive && "bg-accent/10 text-accent font-medium")}
                  >
                    <tab.icon className="h-4 w-4" />
                    <span>{t(tab.labelKey)}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
            {onSetAiSidebarOpen ? (
              <DropdownMenuItem
                onSelect={() => onSetAiSidebarOpen(true)}
                className={cn("flex items-center gap-2", aiAsActiveTab && "bg-accent/10 text-accent font-medium")}
              >
                <Sparkles className="h-4 w-4" />
                <span>{t("projectTabs.ai")}</span>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className={cn("hidden md:flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-border px-sp-2 py-1", className)}>
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/project/${resolvedProjectId}/${tab.path}`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            activeClassName="bg-accent/10 text-accent font-medium"
          >
            <tab.icon className="h-4 w-4" />
            <span>{t(tab.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
