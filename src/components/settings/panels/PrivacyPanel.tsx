import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

export function PrivacyPanel() {
  const [aiDataUsage, setAiDataUsage] = useState(true);

  return (
    <div className="space-y-sp-3">
      <SettingsSection title="AI data controls" description="How your data is used to improve AI suggestions.">
        <div className="flex flex-col gap-sp-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>Use my project data to improve suggestions</Label>
            <p className="text-caption text-muted-foreground">When enabled, AI may learn from your project patterns to give better recommendations.</p>
          </div>
          <Switch checked={aiDataUsage} onCheckedChange={setAiDataUsage} className="shrink-0 self-start sm:self-center" />
        </div>
      </SettingsSection>

      <SettingsSection title="Export my data" description="Download a copy of all your data.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="w-full sm:w-auto" disabled>
            Export data
          </Button>
          <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
        </div>
      </SettingsSection>

      <SettingsSection title="Danger zone">
        <DangerZoneCard
          title="Delete account"
          description="Permanently delete your account and all associated data. This action cannot be undone."
          action={
            <>
              <Button variant="destructive" size="sm" className="w-full sm:w-auto" disabled>
                Delete
              </Button>
              <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
            </>
          }
        />
      </SettingsSection>
    </div>
  );
}
