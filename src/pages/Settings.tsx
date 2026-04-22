import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsNav, type SettingsTab } from "@/components/settings/SettingsNav";
import { ProfilePanel } from "@/components/settings/panels/ProfilePanel";
import { PreferencesPanel } from "@/components/settings/panels/PreferencesPanel";
import { NotificationsPanel } from "@/components/settings/panels/NotificationsPanel";
import { SecurityPanel } from "@/components/settings/panels/SecurityPanel";
import { PrivacyPanel } from "@/components/settings/panels/PrivacyPanel";
import { BillingPanel } from "@/components/settings/panels/BillingPanel";

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
    <div className="mx-auto max-w-5xl px-sp-2 py-sp-3 sm:px-sp-3 lg:px-sp-4 lg:py-sp-4">
      {/* Header */}
      <div className="mb-sp-4 space-y-sp-1">
        <h1 className="text-h3 text-foreground flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" className="-ml-1.5 h-9 w-9 shrink-0 text-foreground" asChild>
            <Link to="/home" aria-label="Back to home">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <SettingsIcon className="h-5 w-5 shrink-0" />
          Settings
        </h1>
        <p className="text-body-sm text-muted-foreground">
          Manage your account, preferences, and billing.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid items-start gap-sp-3 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-sp-4">
        {/* Left nav */}
        <div className="w-full lg:sticky lg:top-16">
          <SettingsNav activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Right panel */}
        <div className="min-w-0 w-full max-w-3xl justify-self-start space-y-sp-3">
          <div className="glass rounded-panel p-sp-3 space-y-sp-3">
            {renderPanel()}
          </div>

          {/* Dev tools are rendered as a floating panel in AppLayout */}
        </div>
      </div>
    </div>
  );
}
