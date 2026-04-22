import { cn } from "@/lib/utils";
import {
  User, SlidersHorizontal, Bell, Shield, Database, CreditCard,
} from "lucide-react";

export type SettingsTab =
  | "profile" | "preferences" | "notifications" | "security" | "privacy" | "billing";

interface NavItem {
  tab: SettingsTab;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { tab: "profile", label: "Profile", icon: User },
  { tab: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { tab: "notifications", label: "Notifications", icon: Bell },
  { tab: "security", label: "Security", icon: Shield },
  { tab: "privacy", label: "Data & Privacy", icon: Database },
  { tab: "billing", label: "Billing & Credits", icon: CreditCard },
];

interface SettingsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsNav({ activeTab, onTabChange }: SettingsNavProps) {
  return (
    <nav className="glass rounded-panel p-sp-2 space-y-sp-2">
      <div className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.tab}
            type="button"
            onClick={() => onTabChange(item.tab)}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-body-sm transition-colors",
              activeTab === item.tab
                ? "bg-accent/10 border-accent/20 text-accent font-medium"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 min-w-0">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
