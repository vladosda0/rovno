import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Monitor, Smartphone, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MOCK_SESSIONS = [
  { id: "1", device: "Chrome on MacOS", location: "Moscow, Russia", lastActive: "Just now", icon: Monitor, current: true },
  { id: "2", device: "Safari on iPhone", location: "Moscow, Russia", lastActive: "2 hours ago", icon: Smartphone, current: false },
  { id: "3", device: "Firefox on Windows", location: "Saint Petersburg, Russia", lastActive: "3 days ago", icon: Globe, current: false },
];

export function SecurityPanel() {
  return (
    <div className="space-y-sp-3">
      <SettingsSection title="Active sessions" description="Devices currently signed in to your account.">
        <div className="space-y-sp-2">
          {MOCK_SESSIONS.map((session) => (
            <div key={session.id} className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="flex items-start gap-2">
                <session.icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body-sm font-medium text-foreground">{session.device}</p>
                    {session.current && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                  </div>
                  <p className="text-caption text-muted-foreground">{session.location} · {session.lastActive}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-sp-2 pt-sp-1">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => toast({ title: "Signed out of other sessions" })}>
            Sign out of other sessions
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-foreground">2FA / Passkeys</p>
              <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
            </div>
            <p className="text-caption text-muted-foreground">Not configured</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Connected accounts" description="Third-party services linked to your account.">
        <Card className="bg-muted/30">
          <CardContent className="p-sp-2">
            <p className="text-caption text-muted-foreground">No connected accounts. OAuth integrations coming soon.</p>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
