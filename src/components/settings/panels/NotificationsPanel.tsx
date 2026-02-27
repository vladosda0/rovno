import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";

interface NotifToggle {
  label: string;
  key: string;
  enabled: boolean;
}

const DEFAULT_GROUPS: { title: string; items: NotifToggle[] }[] = [
  {
    title: "Tasks",
    items: [
      { label: "Assigned to me", key: "task_assigned", enabled: true },
      { label: "Due soon", key: "task_due", enabled: true },
      { label: "Status changed", key: "task_status", enabled: false },
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "Scan finished", key: "doc_scan", enabled: true },
      { label: "Risks found", key: "doc_risks", enabled: true },
      { label: "Clean version ready", key: "doc_ready", enabled: false },
    ],
  },
  {
    title: "Budget & Procurement",
    items: [
      { label: "Over budget warnings", key: "budget_over", enabled: true },
      { label: "Approvals needed", key: "budget_approval", enabled: true },
    ],
  },
  {
    title: "Mentions & Comments",
    items: [
      { label: "Someone mentions me", key: "mention", enabled: true },
      { label: "New comment on my task", key: "comment", enabled: true },
    ],
  },
];

export function NotificationsPanel() {
  const [channels, setChannels] = useState({ inApp: true, email: false, telegram: false });
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [digest, setDigest] = useState("instant");

  const toggleChannel = (ch: keyof typeof channels) => setChannels((prev) => ({ ...prev, [ch]: !prev[ch] }));

  const toggleItem = (groupIdx: number, itemIdx: number) => {
    setGroups((prev) => prev.map((g, gi) => gi !== groupIdx ? g : {
      ...g,
      items: g.items.map((item, ii) => ii !== itemIdx ? item : { ...item, enabled: !item.enabled }),
    }));
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title="Channels" description="Where you receive notifications.">
        <div className="flex flex-wrap gap-sp-2">
          <div className="flex items-center gap-2">
            <Switch checked={channels.inApp} onCheckedChange={() => toggleChannel("inApp")} />
            <Label>In-app</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={channels.email} onCheckedChange={() => toggleChannel("email")} />
            <Label>Email</Label>
          </div>
          <div className="flex items-center gap-2 opacity-50">
            <Switch checked={false} disabled />
            <Label>Telegram</Label>
            <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
          </div>
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title="Event preferences" description="Choose which events trigger notifications.">
        <div className="space-y-sp-2">
          {groups.map((group, gi) => (
            <div key={group.title} className="space-y-1.5">
              <p className="text-body-sm font-medium text-foreground">{group.title}</p>
              {group.items.map((item, ii) => (
                <div key={item.key} className="flex items-center justify-between py-1">
                  <span className="text-caption text-muted-foreground">{item.label}</span>
                  <Switch checked={item.enabled} onCheckedChange={() => toggleItem(gi, ii)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title="Digest frequency" description="How often to receive email digests.">
        <Select value={digest} onValueChange={setDigest}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="instant">Instant</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </SettingsSection>

      <Button onClick={() => toast({ title: "Notification preferences saved" })}>Save preferences</Button>
    </div>
  );
}
