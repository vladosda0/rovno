import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { SettingsNav, type SettingsTab, type SettingsScope } from "@/components/settings/SettingsNav";
import { ProfilePanel } from "@/components/settings/panels/ProfilePanel";
import { PreferencesPanel } from "@/components/settings/panels/PreferencesPanel";
import { NotificationsPanel } from "@/components/settings/panels/NotificationsPanel";
import { SecurityPanel } from "@/components/settings/panels/SecurityPanel";
import { PrivacyPanel } from "@/components/settings/panels/PrivacyPanel";
import { BillingPanel } from "@/components/settings/panels/BillingPanel";
import { AuthSimulator } from "@/components/settings/AuthSimulator";
import { Badge } from "@/components/ui/badge";

const VALID_TABS = new Set<SettingsTab>([
  "profile", "preferences", "notifications", "security", "privacy", "billing",
]);

function getTabFromParam(param: string | null): SettingsTab {
  if (param && VALID_TABS.has(param as SettingsTab)) return param as SettingsTab;
  return "profile";
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => getTabFromParam(searchParams.get("tab")));
  const [activeScope, setActiveScope] = useState<SettingsScope>("personal");

  // Sync tab from URL changes (e.g. redirect from /profile/upgrade)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const resolved = getTabFromParam(tabParam);
    if (resolved !== activeTab) setActiveTab(resolved);
  }, [searchParams]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const handleScopeChange = (scope: SettingsScope) => {
    setActiveScope(scope);
  };

  const renderPanel = () => {
    switch (activeTab) {
      case "profile": return <ProfilePanel />;
      case "preferences": return <PreferencesPanel />;
      case "notifications": return <NotificationsPanel />;
      case "security": return <SecurityPanel />;
      case "privacy": return <PrivacyPanel />;
      case "billing": return <BillingPanel />;
      default: return (
        <div className="flex items-center justify-center h-40">
          <p className="text-muted-foreground text-body-sm">This section is coming soon.</p>
        </div>
      );
    }
  };

  return (
    <div className="p-sp-3 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-sp-3">
        <h1 className="text-h3 text-foreground flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          Settings
        </h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          Manage your account, preferences, and billing.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-sp-3 items-start">
        {/* Left nav */}
        <div className="w-56 shrink-0 sticky top-16">
          <SettingsNav
            activeTab={activeTab}
            activeScope={activeScope}
            onTabChange={handleTabChange}
            onScopeChange={handleScopeChange}
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0">
          {renderPanel()}

          {/* Dev tools */}
          {import.meta.env.DEV && (
            <div className="mt-sp-4 pt-sp-3 border-t border-border">
              <div className="mb-sp-2">
                <p className="text-caption font-medium text-muted-foreground flex items-center gap-1.5">
                  🛠 Dev Tools
                  <Badge variant="secondary" className="text-[9px]">DEV</Badge>
                </p>
                <p className="text-caption text-muted-foreground/60 mt-0.5">
                  Local role simulation for demos and QA. Not shown in production.
                </p>
              </div>
              <AuthSimulator />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
