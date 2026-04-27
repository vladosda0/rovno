import { NavLink } from "@/components/NavLink";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  getProjectDomainAccess,
  projectDomainAllowsView,
  usePermission,
  type ProjectDomain,
} from "@/lib/permissions";
import {
  LayoutDashboard, Calculator, ShoppingCart,
  Image, FileText, Users, HardHat, ListTodo,
  type LucideIcon,
} from "lucide-react";

export interface ProjectTabDefinition {
  labelKey: string;
  path: string;
  icon: LucideIcon;
  domain?: ProjectDomain;
}

export const PROJECT_TABS: readonly ProjectTabDefinition[] = [
  { labelKey: "projectTabs.dashboard", path: "dashboard", icon: LayoutDashboard },
  { labelKey: "projectTabs.estimate", path: "estimate", icon: Calculator, domain: "estimate" },
  { labelKey: "projectTabs.tasks", path: "tasks", icon: ListTodo, domain: "tasks" },
  { labelKey: "projectTabs.procurement", path: "procurement", icon: ShoppingCart, domain: "procurement" },
  { labelKey: "projectTabs.hr", path: "hr", icon: HardHat, domain: "hr" },
  { labelKey: "projectTabs.gallery", path: "gallery", icon: Image, domain: "gallery" },
  { labelKey: "projectTabs.documents", path: "documents", icon: FileText, domain: "documents" },
  { labelKey: "projectTabs.participants", path: "participants", icon: Users, domain: "participants" },
];

export function useVisibleProjectTabs(projectId: string | undefined): ProjectTabDefinition[] {
  const perm = usePermission(projectId ?? "");
  return PROJECT_TABS.filter((tab) => {
    if (!tab.domain) return true;
    return projectDomainAllowsView(getProjectDomainAccess(perm.seam, tab.domain));
  });
}

interface ProjectTabsProps {
  className?: string;
  projectId?: string;
}

export function ProjectTabs({ className, projectId }: ProjectTabsProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const resolvedProjectId = projectId ?? id;
  const visibleTabs = useVisibleProjectTabs(resolvedProjectId);

  if (!resolvedProjectId) return null;

  return (
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
  );
}
