import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

export function PrivacyPanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("privacy.ai.title")} description={t("privacy.ai.description")}>
        <div className="flex flex-col gap-sp-2 opacity-50 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>{t("privacy.ai.label")}</Label>
            <p className="text-caption text-muted-foreground">{t("privacy.ai.helper")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            <Switch checked={false} disabled className="shrink-0" />
            <Badge variant="secondary" className="text-[10px]">{t("privacy.ai.comingSoon")}</Badge>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("privacy.export.title")} description={t("privacy.export.description")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="w-full sm:w-auto" disabled>
            {t("privacy.export.button")}
          </Button>
          <Badge variant="secondary" className="text-[10px]">{t("privacy.export.comingSoon")}</Badge>
        </div>
      </SettingsSection>

      <SettingsSection title={t("privacy.danger.title")}>
        <DangerZoneCard
          title={t("privacy.delete.title")}
          description={t("privacy.delete.description")}
          action={
            <>
              <Button variant="destructive" size="sm" className="w-full sm:w-auto" disabled>
                {t("privacy.delete.button")}
              </Button>
              <Badge variant="secondary" className="text-[10px]">{t("privacy.delete.comingSoon")}</Badge>
            </>
          }
        />
      </SettingsSection>
    </div>
  );
}
