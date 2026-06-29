import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { Monitor } from "lucide-react";

function parseCurrentDevice(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  let browser = "Browser";
  // iOS third-party browsers run on WebKit and advertise their own tokens
  // (CriOS/FxiOS/EdgiOS), not Chrome//Firefox//Edg/ — detect those first.
  if (/EdgiOS\//.test(ua)) browser = "Edge";
  else if (/CriOS\//.test(ua)) browser = "Chrome";
  else if (/FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

  let os = "";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} on ${os}` : browser;
}

export function SecurityPanel() {
  const { t } = useTranslation();
  const { status } = useRuntimeAuth();
  const currentDevice = useMemo(() => parseCurrentDevice(), []);
  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("security.sessions.title")} description={t("security.sessions.description")}>
        <div className="space-y-sp-2">
          {status === "authenticated" && (
            <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="flex items-start gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body-sm font-medium text-foreground">{currentDevice}</p>
                    <Badge variant="secondary" className="text-[10px]">{t("security.sessions.current")}</Badge>
                  </div>
                  <p className="text-caption text-muted-foreground">{t("security.sessions.currentActive")}</p>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body-sm font-medium text-foreground">{t("security.sessions.multiDevice")}</p>
                <Badge variant="secondary" className="text-[10px]">{t("security.sessions.comingSoon")}</Badge>
              </div>
              <p className="text-caption text-muted-foreground">{t("security.sessions.multiDeviceNote")}</p>
            </div>
          </div>
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
