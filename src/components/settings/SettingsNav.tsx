import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  User, SlidersHorizontal, Bell, Shield, Database, CreditCard,
} from "lucide-react";

export type SettingsTab =
  | "profile" | "preferences" | "notifications" | "security" | "privacy" | "billing";

interface NavItem {
  tab: SettingsTab;
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { tab: "profile", labelKey: "settingsNav.personal.profile", icon: User },
  { tab: "preferences", labelKey: "settingsNav.personal.preferences", icon: SlidersHorizontal },
  { tab: "notifications", labelKey: "settingsNav.personal.notifications", icon: Bell },
  { tab: "security", labelKey: "settingsNav.personal.security", icon: Shield },
  { tab: "privacy", labelKey: "settingsNav.personal.privacy", icon: Database },
  { tab: "billing", labelKey: "settingsNav.personal.billing", icon: CreditCard },
];


interface SettingsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsNav({ activeTab, onTabChange }: SettingsNavProps) {
  const { t } = useTranslation();

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
            <span className="flex-1 min-w-0">{t(item.labelKey)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
