import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";

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

export function NotificationsPanel() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState({ inApp: true });
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [digest, setDigest] = useState("instant");

  const toggleInApp = () => setChannels((prev) => ({ ...prev, inApp: !prev.inApp }));

  const toggleItem = (groupIdx: number, itemIdx: number) => {
    setGroups((prev) => prev.map((g, gi) => gi !== groupIdx ? g : {
      ...g,
      items: g.items.map((item, ii) => ii !== itemIdx ? item : { ...item, enabled: !item.enabled }),
    }));
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("notifications.channels.title")} description={t("notifications.channels.description")}>
        <div className="flex flex-wrap gap-sp-2">
          <div className="flex items-center gap-2">
            <Switch checked={channels.inApp} onCheckedChange={toggleInApp} />
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
          {groups.map((group, gi) => (
            <div key={group.titleKey} className="rounded-card bg-background/60 p-sp-2 space-y-1.5">
              <p className="text-body-sm font-medium text-foreground">{t(group.titleKey)}</p>
              {group.items.map((item, ii) => (
                <div key={item.key} className="flex items-center justify-between gap-sp-2 py-1">
                  <span className="min-w-0 flex-1 text-caption text-muted-foreground">{t(item.labelKey)}</span>
                  <Switch checked={item.enabled} onCheckedChange={() => toggleItem(gi, ii)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t("notifications.digest.title")} description={t("notifications.digest.description")}>
        <Select value={digest} onValueChange={setDigest}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="instant">{t("notifications.digest.instant")}</SelectItem>
            <SelectItem value="daily">{t("notifications.digest.daily")}</SelectItem>
            <SelectItem value="weekly">{t("notifications.digest.weekly")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsSection>

      <div className="flex flex-wrap gap-sp-2 pt-sp-1">
        <Button className="w-full sm:w-auto" onClick={() => toast({ title: t("notifications.savedToast") })}>{t("notifications.save")}</Button>
      </div>
    </div>
  );
}
