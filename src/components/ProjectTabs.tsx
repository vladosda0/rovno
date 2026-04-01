import { NavLink } from "@/components/NavLink";
import { useParams } from "react-router-dom";
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
} from "lucide-react";

const tabs = [
  { label: "Dashboard", path: "dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "tasks", icon: ListTodo, domain: "tasks" as ProjectDomain },
  { label: "Estimate", path: "estimate", icon: Calculator, domain: "estimate" as ProjectDomain },
  { label: "Procurement", path: "procurement", icon: ShoppingCart, domain: "procurement" as ProjectDomain },
  { label: "HR", path: "hr", icon: HardHat, domain: "hr" as ProjectDomain },
  { label: "Gallery", path: "gallery", icon: Image, domain: "gallery" as ProjectDomain },
  { label: "Documents", path: "documents", icon: FileText, domain: "documents" as ProjectDomain },
  { label: "Participants", path: "participants", icon: Users, domain: "participants" as ProjectDomain },
];

interface ProjectTabsProps {
  className?: string;
  projectId?: string;
}

export function ProjectTabs({ className, projectId }: ProjectTabsProps) {
  const { id } = useParams();
  const resolvedProjectId = projectId ?? id;
  const perm = usePermission(resolvedProjectId ?? "");

  if (!resolvedProjectId) return null;

  const visibleTabs = tabs.filter((tab) => {
    if (!("domain" in tab) || !tab.domain) return true;
    return projectDomainAllowsView(getProjectDomainAccess(perm.seam, tab.domain));
  });

  return (
    <nav className={cn("flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-border px-sp-2 py-1", className)}>
      {visibleTabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={`/project/${resolvedProjectId}/${tab.path}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          activeClassName="bg-accent/10 text-accent font-medium"
        >
          <tab.icon className="h-4 w-4" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
