import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  FileText,
  Package,
  Warehouse,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface HomeTabDefinition {
  value: string;
  labelKey: string;
  icon: LucideIcon;
}

export const HOME_TABS: readonly HomeTabDefinition[] = [
  { value: "overview", labelKey: "home.tabs.overview", icon: LayoutDashboard },
  { value: "projects", labelKey: "home.tabs.projects", icon: FolderOpen },
  { value: "tasks", labelKey: "home.tabs.tasks", icon: CheckSquare },
  { value: "documents", labelKey: "home.tabs.documents", icon: FileText },
  { value: "procurement", labelKey: "home.tabs.procurement", icon: Package },
  { value: "inventory", labelKey: "home.tabs.inventory", icon: Warehouse },
  { value: "finance", labelKey: "home.tabs.finance", icon: TrendingUp },
  { value: "resources", labelKey: "home.tabs.resources", icon: Users },
];

export const VALID_HOME_TABS = new Set<string>(HOME_TABS.map((tab) => tab.value));

interface HomeTabsProps {
  className?: string;
}

export function HomeTabs({ className }: HomeTabsProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const activeTab = paramTab && VALID_HOME_TABS.has(paramTab) ? paramTab : "overview";

  return (
    <nav
      className={cn(
        "hidden md:flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-border px-sp-2 py-1",
        className,
      )}
    >
      {HOME_TABS.map((tab) => {
        const isActive = activeTab === tab.value;
        const to = tab.value === "overview" ? "/home" : `/home?tab=${tab.value}`;
        return (
          <Link
            key={tab.value}
            to={to}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm transition-colors duration-150",
              isActive
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span>{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
