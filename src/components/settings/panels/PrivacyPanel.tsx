import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

export function PrivacyPanel() {
  const [aiDataUsage, setAiDataUsage] = useState(true);

  return (
    <div className="space-y-sp-3">
      <SettingsSection title="AI data controls" description="How your data is used to improve AI suggestions.">
        <div className="flex items-center justify-between py-1">
          <div className="space-y-0.5">
            <Label>Use my project data to improve suggestions</Label>
            <p className="text-caption text-muted-foreground">When enabled, AI may learn from your project patterns to give better recommendations.</p>
          </div>
          <Switch checked={aiDataUsage} onCheckedChange={setAiDataUsage} />
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title="Export my data" description="Download a copy of all your data.">
        <Button variant="outline" disabled>
          Export data <Badge variant="secondary" className="ml-2 text-[10px]">Coming soon</Badge>
        </Button>
      </SettingsSection>

      <Separator />

      <SettingsSection title="Danger zone">
        <DangerZoneCard
          title="Delete account"
          description="Permanently delete your account and all associated data. This action cannot be undone."
          action={
            <Button variant="destructive" size="sm" disabled>
              Delete <Badge variant="secondary" className="ml-1 text-[10px]">Coming soon</Badge>
            </Button>
          }
        />
      </SettingsSection>
    </div>
  );
}
