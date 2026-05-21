import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";
import { AutoRenewToggle } from "@/components/billing/AutoRenewToggle";
import { PaymentHistory } from "@/components/billing/PaymentHistory";
import { CancelSubscriptionDialog } from "@/components/billing/CancelSubscriptionDialog";
import { PLANS } from "@/data/plans";
import { formatRubFromKopecks } from "@/lib/billing";

// Real T-Bank subscription management. Rendered by BillingPanel only when
// BILLING_ENABLED, so prod (flag off) behavior is unchanged.
export function SubscriptionSection() {
  const { t, i18n } = useTranslation();
  const { subscription, status, readOnly, isLoading, refetch } = useActiveSubscription();

  if (isLoading) return null;

  if (!subscription || status === "none") {
    return (
      <SettingsSection
        title={t("settings.billing.subscriptionTitle")}
        description={t("settings.billing.noSubscription")}
      >
        <Button asChild>
          <Link to="/pricing">{t("settings.billing.choosePlan")}</Link>
        </Button>
      </SettingsSection>
    );
  }

  const planName = PLANS[subscription.plan_code as keyof typeof PLANS]?.display_name ?? subscription.plan_code;
  const priceLabel = subscription.amount_cents != null ? formatRubFromKopecks(subscription.amount_cents) : "—";
  const dateFmt = new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const endsAt = subscription.current_period_ends_at
    ? dateFmt.format(new Date(subscription.current_period_ends_at))
    : null;
  const startsAt = subscription.current_period_starts_at
    ? dateFmt.format(new Date(subscription.current_period_starts_at))
    : null;
  const periodLabel = startsAt && endsAt ? `${startsAt} — ${endsAt}` : endsAt ?? "—";

  return (
    <SettingsSection
      title={t("settings.billing.subscriptionTitle")}
      description={t("settings.billing.subscriptionDescription")}
    >
      <Card>
        <CardContent className="p-sp-2 space-y-sp-2">
          <div className="flex justify-between gap-2 text-body-sm">
            <span className="text-muted-foreground">{t("settings.billing.currentPlan")}</span>
            <span className="font-medium text-foreground">{planName}</span>
          </div>
          <div className="flex justify-between gap-2 text-body-sm">
            <span className="text-muted-foreground">{t("settings.billing.period")}</span>
            <span className="text-foreground">{periodLabel}</span>
          </div>
          <div className="flex justify-between gap-2 text-body-sm">
            <span className="text-muted-foreground">{t("settings.billing.price")}</span>
            <span className="font-medium text-foreground">
              {priceLabel}
              {t("pricing.perMonth")}
            </span>
          </div>
          {status === "grace" && endsAt ? (
            <p className="text-caption text-warning">{t("settings.billing.graceNote", { date: endsAt })}</p>
          ) : null}
          {readOnly ? (
            <p className="text-caption text-destructive">{t("settings.billing.readOnlyNote")}</p>
          ) : null}
        </CardContent>
      </Card>

      <AutoRenewToggle
        subscriptionId={subscription.id}
        autoRenew={subscription.auto_renew}
        onChanged={refetch}
      />

      <div>
        <p className="mb-sp-1 text-body-sm font-semibold text-foreground">
          {t("settings.billing.history")}
        </p>
        <PaymentHistory />
      </div>

      <div className="flex flex-wrap items-center gap-sp-2 pt-sp-1">
        {subscription.auto_renew ? (
          <CancelSubscriptionDialog
            subscriptionId={subscription.id}
            activeUntilLabel={endsAt}
            onCancelled={refetch}
          />
        ) : (
          <p className="text-caption text-muted-foreground">
            {endsAt ? t("settings.billing.autoRenewOffNote", { date: endsAt }) : null}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
