import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  User, SlidersHorizontal, Bell, Shield, Database, CreditCard,
  Building2, Users, FileStack, Activity,
  FolderCog, AlertCircle, Bot,
} from "lucide-react";

export type SettingsTab =
  | "profile" | "preferences" | "notifications" | "security" | "privacy" | "billing"
  // Workspace (disabled)
  | "ws-profile" | "ws-members" | "ws-templates" | "ws-audit"
  // Project defaults (disabled)
  | "pd-preferences" | "pd-budget" | "pd-autopilot";

export type SettingsScope = "personal" | "workspace" | "project";

interface NavItem {
  tab: SettingsTab;
  label: string;
  icon: React.ElementType;
  disabled?: boolean;
}

const PERSONAL_ITEMS: NavItem[] = [
  { tab: "profile", label: "Profile", icon: User },
  { tab: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { tab: "notifications", label: "Notifications", icon: Bell },
  { tab: "security", label: "Security", icon: Shield },
  { tab: "privacy", label: "Data & Privacy", icon: Database },
  { tab: "billing", label: "Billing & Credits", icon: CreditCard },
];

const WORKSPACE_ITEMS: NavItem[] = [
  { tab: "ws-profile", label: "Workspace Profile", icon: Building2, disabled: true },
  { tab: "ws-members", label: "Members & Roles", icon: Users, disabled: true },
  { tab: "ws-templates", label: "Templates", icon: FileStack, disabled: true },
  { tab: "ws-audit", label: "Audit & Activity", icon: Activity, disabled: true },
];

const PROJECT_ITEMS: NavItem[] = [
  { tab: "pd-preferences", label: "Project Preferences", icon: FolderCog, disabled: true },
  { tab: "pd-budget", label: "Budget Alerts", icon: AlertCircle, disabled: true },
  { tab: "pd-autopilot", label: "AI Autopilot", icon: Bot, disabled: true },
];

interface SettingsNavProps {
  activeTab: SettingsTab;
  activeScope: SettingsScope;
  onTabChange: (tab: SettingsTab) => void;
  onScopeChange: (scope: SettingsScope) => void;
}

export function SettingsNav({ activeTab, activeScope, onTabChange, onScopeChange }: SettingsNavProps) {
  const scopes: { value: SettingsScope; label: string; disabled?: boolean }[] = [
    { value: "personal", label: "Personal" },
    { value: "workspace", label: "Workspace", disabled: true },
    { value: "project", label: "Project defaults", disabled: true },
  ];

  const items = activeScope === "personal" ? PERSONAL_ITEMS
    : activeScope === "workspace" ? WORKSPACE_ITEMS
    : PROJECT_ITEMS;

  return (
    <nav className="glass rounded-panel p-sp-2 space-y-sp-2">
      {/* Scope switcher */}
      <div className="space-y-1">
        {scopes.map((scope) => (
          <button
            key={scope.value}
            onClick={() => !scope.disabled && onScopeChange(scope.value)}
            disabled={scope.disabled}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-body-sm font-medium transition-colors",
              activeScope === scope.value
                ? "bg-accent/10 border-accent/20 text-accent"
                : scope.disabled
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <span className="flex-1 min-w-0">{scope.label}</span>
            {scope.disabled && <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">Soon</Badge>}
          </button>
        ))}
      </div>

      {/* Nav items */}
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.tab}
            onClick={() => !item.disabled && onTabChange(item.tab)}
            disabled={item.disabled}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-body-sm transition-colors",
              activeTab === item.tab
                ? "bg-accent/10 border-accent/20 text-accent font-medium"
                : item.disabled
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 min-w-0">{item.label}</span>
            {item.disabled && <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">Soon</Badge>}
          </button>
        ))}
      </div>
    </nav>
  );
}
