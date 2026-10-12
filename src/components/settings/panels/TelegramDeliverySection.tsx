import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Switch } from "@/components/ui/switch";
import { TELEGRAM_LINKING_ENABLED } from "@/data/messenger-links";
import { toast } from "@/hooks/use-toast";
import { useTelegramDelivery } from "@/hooks/use-telegram-delivery";

const ROW_CLASS = "flex items-center justify-between gap-sp-2 py-1";
const ROW_LABEL_CLASS = "min-w-0 flex-1 text-body-sm text-foreground";

/** Settings -> Notifications -> "Where to send": the Telegram channel of Shurik's messages. */
export function TelegramDeliverySection() {
  const { t } = useTranslation();
  const { snapshot, isSaving, saveSettings } = useTelegramDelivery(() => {
    toast({
      title: t("notifications.saveFailedToast"),
      description: t("notifications.saveFailedDescription"),
      variant: "destructive",
    });
  });

  // Nothing to switch and nowhere to link in a build without the Integrations tab.
  if (!snapshot || (!snapshot.linked && !TELEGRAM_LINKING_ENABLED)) {
    return null;
  }

  return (
    <SettingsSection title={t("notifications.delivery.title")}>
      {snapshot.linked ? (
        <div>
          <div className={ROW_CLASS}>
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm text-foreground">{t("notifications.delivery.telegram")}</span>
              <span className="block text-caption text-muted-foreground">
                {t("notifications.delivery.linked", {
                  name: snapshot.linkedName ?? t("integrations.telegram.linkedFallback"),
                })}
              </span>
            </span>
            <Switch
              checked={snapshot.settings.enabled}
              onCheckedChange={(enabled) => saveSettings({ enabled })}
              disabled={isSaving}
              aria-label={t("notifications.delivery.telegram")}
            />
          </div>
          <div className={ROW_CLASS}>
            <span className={ROW_LABEL_CLASS}>{t("notifications.delivery.quietNight")}</span>
            <Switch
              checked={snapshot.settings.quietNight}
              onCheckedChange={(quietNight) => saveSettings({ quietNight })}
              disabled={isSaving}
              aria-label={t("notifications.delivery.quietNight")}
            />
          </div>
        </div>
      ) : (
        <div className={ROW_CLASS}>
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm text-foreground">{t("notifications.delivery.telegram")}</span>
            <span className="block text-caption text-muted-foreground">
              {t("integrations.telegram.notLinkedHint")}
            </span>
          </span>
          <Link to="/settings?tab=integrations" className="shrink-0 text-body-sm text-primary underline-offset-2 hover:underline">
            {t("integrations.telegram.connect")}
          </Link>
        </div>
      )}
    </SettingsSection>
  );
}
