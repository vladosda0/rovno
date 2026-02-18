import { NavLink } from "@/components/NavLink";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ListTodo, Calculator, ShoppingCart,
  Image, FileText, Activity, Users,
} from "lucide-react";

const tabs = [
  { label: "Dashboard", path: "dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "tasks", icon: ListTodo },
  { label: "Estimate", path: "estimate", icon: Calculator },
  { label: "Procurement", path: "procurement", icon: ShoppingCart },
  { label: "Gallery", path: "gallery", icon: Image },
  { label: "Documents", path: "documents", icon: FileText },
  { label: "Activity", path: "activity", icon: Activity },
  { label: "Participants", path: "participants", icon: Users },
];

export function ProjectTabs() {
  const { id } = useParams();

  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-sp-2 py-1">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={`/project/${id}/${tab.path}`}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          activeClassName="bg-accent/10 text-accent font-medium"
        >
          <tab.icon className="h-4 w-4" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
