import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";
import {
  useUpdateWorkspaceNotificationPreferences,
  useWorkspaceNotificationPreferencesState,
} from "@/hooks/use-workspace-source";
import type { NotificationDigestFrequency } from "@/data/workspace-source";

interface NotifToggle {
  labelKey: string;
  key: string;
  enabled: boolean;
}

const DEFAULT_GROUPS: { titleKey: string; items: NotifToggle[] }[] = [
  {
    titleKey: "notifications.group.tasks",
    items: [
      { labelKey: "notifications.group.tasks.assigned", key: "task_assigned", enabled: true },
      { labelKey: "notifications.group.tasks.due", key: "task_due", enabled: true },
      { labelKey: "notifications.group.tasks.status", key: "task_status", enabled: false },
    ],
  },
  {
    titleKey: "notifications.group.documents",
    items: [
      { labelKey: "notifications.group.documents.scan", key: "doc_scan", enabled: true },
      { labelKey: "notifications.group.documents.risks", key: "doc_risks", enabled: true },
      { labelKey: "notifications.group.documents.ready", key: "doc_ready", enabled: false },
    ],
  },
  {
    titleKey: "notifications.group.budget",
    items: [
      { labelKey: "notifications.group.budget.over", key: "budget_over", enabled: true },
      { labelKey: "notifications.group.budget.approval", key: "budget_approval", enabled: true },
    ],
  },
  {
    titleKey: "notifications.group.mentions",
    items: [
      { labelKey: "notifications.group.mentions.mention", key: "mention", enabled: true },
      { labelKey: "notifications.group.mentions.comment", key: "comment", enabled: true },
    ],
  },
];

/** Resolve the full toggle map: persisted value wins, otherwise the catalog default. */
function resolveEventToggles(saved: Record<string, boolean> | undefined): Record<string, boolean> {
  const resolved: Record<string, boolean> = {};
  for (const group of DEFAULT_GROUPS) {
    for (const item of group.items) {
      resolved[item.key] = saved?.[item.key] ?? item.enabled;
    }
  }
  return resolved;
}

export function NotificationsPanel() {
  const { t } = useTranslation();
  const { preferences, isLoading } = useWorkspaceNotificationPreferencesState();
  const updatePreferences = useUpdateWorkspaceNotificationPreferences();
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [eventToggles, setEventToggles] = useState<Record<string, boolean>>(() => resolveEventToggles(undefined));
  const [digest, setDigest] = useState<NotificationDigestFrequency>("instant");
  const hydratedRef = useRef(false);

  // Seed the form from the loaded preferences ONCE, on first availability. A
  // later background refetch (window focus after staleTime) must not clobber the
  // user's unsaved in-progress edits.
  useEffect(() => {
    if (!preferences || hydratedRef.current) return;
    hydratedRef.current = true;
    setInAppEnabled(preferences.inAppEnabled);
    setEventToggles(resolveEventToggles(preferences.eventToggles));
    setDigest(preferences.digestFrequency);
  }, [preferences]);

  const toggleInApp = () => setInAppEnabled((prev) => !prev);

  const toggleItem = (key: string) => {
    setEventToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        inAppEnabled,
        digestFrequency: digest,
        eventToggles: resolveEventToggles(eventToggles),
      });
      toast({ title: t("notifications.savedToast") });
    } catch {
      toast({
        title: t("notifications.saveFailedToast"),
        description: t("notifications.saveFailedDescription"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("notifications.channels.title")} description={t("notifications.channels.description")}>
        <div className="flex flex-wrap gap-sp-2">
          <div className="flex items-center gap-2">
            <Switch checked={inAppEnabled} onCheckedChange={toggleInApp} />
            <Label>{t("notifications.channels.inApp")}</Label>
          </div>
          <div className="flex items-center gap-2 opacity-50">
            <Switch checked={false} disabled />
            <Label>{t("notifications.channels.email")}</Label>
            <Badge variant="secondary" className="text-[10px]">{t("notifications.channels.comingSoon")}</Badge>
          </div>
          <div className="flex items-center gap-2 opacity-50">
            <Switch checked={false} disabled />
            <Label>{t("notifications.channels.telegram")}</Label>
            <Badge variant="secondary" className="text-[10px]">{t("notifications.channels.comingSoon")}</Badge>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("notifications.events.title")} description={t("notifications.events.description")}>
        <div className="space-y-sp-2">
          {DEFAULT_GROUPS.map((group) => (
            <div key={group.titleKey} className="rounded-card bg-background/60 p-sp-2 space-y-1.5">
              <p className="text-body-sm font-medium text-foreground">{t(group.titleKey)}</p>
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-sp-2 py-1">
                  <span className="min-w-0 flex-1 text-caption text-muted-foreground">{t(item.labelKey)}</span>
                  <Switch checked={eventToggles[item.key] ?? item.enabled} onCheckedChange={() => toggleItem(item.key)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t("notifications.digest.title")} description={t("notifications.digest.description")}>
        <Select value={digest} onValueChange={(value) => setDigest(value as NotificationDigestFrequency)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="instant">{t("notifications.digest.instant")}</SelectItem>
            <SelectItem value="daily">{t("notifications.digest.daily")}</SelectItem>
            <SelectItem value="weekly">{t("notifications.digest.weekly")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsSection>

      <div className="flex flex-wrap gap-sp-2 pt-sp-1">
        <Button
          className="w-full sm:w-auto"
          disabled={isLoading || updatePreferences.isPending}
          onClick={() => void handleSave()}
        >
          {t("notifications.save")}
        </Button>
      </div>
    </div>
  );
}
