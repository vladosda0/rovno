import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
        <div className="space-y-2">
          {MOCK_SESSIONS.map((session) => (
            <Card key={session.id} className="bg-card">
              <CardContent className="p-sp-2 flex items-center gap-3">
                <session.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-body-sm font-medium text-foreground">{session.device}</p>
                    {session.current && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                  </div>
                  <p className="text-caption text-muted-foreground">{session.location} · {session.lastActive}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button variant="outline" onClick={() => toast({ title: "Signed out of other sessions" })}>
          Sign out of other sessions
        </Button>
      </SettingsSection>

      <Separator />

      <SettingsSection title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <Card className="bg-muted/30">
          <CardContent className="p-sp-2 flex items-center justify-between">
            <div>
              <p className="text-body-sm font-medium text-foreground">2FA / Passkeys</p>
              <p className="text-caption text-muted-foreground">Not configured</p>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </CardContent>
        </Card>
      </SettingsSection>

      <Separator />

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
