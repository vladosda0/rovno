import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Monitor, Smartphone, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MOCK_SESSIONS = [
  { id: "1", deviceKey: "security.mock.session1.device", locationKey: "security.mock.session1.location", lastActiveKey: "security.mock.session1.lastActive", icon: Monitor, current: true },
  { id: "2", deviceKey: "security.mock.session2.device", locationKey: "security.mock.session2.location", lastActiveKey: "security.mock.session2.lastActive", icon: Smartphone, current: false },
  { id: "3", deviceKey: "security.mock.session3.device", locationKey: "security.mock.session3.location", lastActiveKey: "security.mock.session3.lastActive", icon: Globe, current: false },
];

export function SecurityPanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("security.sessions.title")} description={t("security.sessions.description")}>
        <div className="space-y-sp-2">
          {MOCK_SESSIONS.map((session) => (
            <div key={session.id} className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="flex items-start gap-2">
                <session.icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body-sm font-medium text-foreground">{t(session.deviceKey)}</p>
                    {session.current && <Badge variant="secondary" className="text-[10px]">{t("security.sessions.current")}</Badge>}
                  </div>
                  <p className="text-caption text-muted-foreground">{t(session.locationKey)} · {t(session.lastActiveKey)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-sp-2 pt-sp-1">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => toast({ title: t("security.sessions.signedOutToast") })}>
            {t("security.sessions.signOutOthers")}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t("security.twoFa.title")} description={t("security.twoFa.description")}>
        <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-foreground">{t("security.twoFa.label")}</p>
              <Badge variant="secondary" className="text-[10px]">{t("security.twoFa.comingSoon")}</Badge>
            </div>
            <p className="text-caption text-muted-foreground">{t("security.twoFa.notConfigured")}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("security.connected.title")} description={t("security.connected.description")}>
        <Card className="bg-muted/30">
          <CardContent className="p-sp-2">
            <p className="text-caption text-muted-foreground">{t("security.connected.empty")}</p>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
