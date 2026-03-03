import { NavLink } from "@/components/NavLink";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ListTodo, Calculator, ShoppingCart,
  Image, FileText, Users, HardHat,
} from "lucide-react";

const tabs = [
  { label: "Dashboard", path: "dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "tasks", icon: ListTodo },
  { label: "Estimate", path: "estimate", icon: Calculator },
  { label: "Procurement", path: "procurement", icon: ShoppingCart },
  { label: "HR", path: "hr", icon: HardHat },
  { label: "Gallery", path: "gallery", icon: Image },
  { label: "Documents", path: "documents", icon: FileText },
  { label: "Participants", path: "participants", icon: Users },
];

interface ProjectTabsProps {
  className?: string;
  projectId?: string;
}

export function ProjectTabs({ className, projectId }: ProjectTabsProps) {
  const { id } = useParams();
  const resolvedProjectId = projectId ?? id;

  if (!resolvedProjectId) return null;

  return (
    <nav className={cn("flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-border px-sp-2 py-1", className)}>
      {tabs.map((tab) => (
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
