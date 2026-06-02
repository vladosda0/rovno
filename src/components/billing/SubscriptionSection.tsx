import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";
import { AutoRenewToggle } from "@/components/billing/AutoRenewToggle";
import { PaymentHistory } from "@/components/billing/PaymentHistory";
import { CancelSubscriptionDialog } from "@/components/billing/CancelSubscriptionDialog";
import { PLANS } from "@/data/plans";
import { formatRubFromKopecks } from "@/lib/billing";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

// tbank RPC is not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

// Real T-Bank subscription management. Rendered by BillingPanel only when
// BILLING_ENABLED, so prod (flag off) behavior is unchanged.
export function SubscriptionSection() {
  const { t, i18n } = useTranslation();
  const { subscription, status, readOnly, isLoading, refetch } = useActiveSubscription();
  const [clearingDowngrade, setClearingDowngrade] = useState(false);

  // "Keep current plan" — cancel a scheduled downgrade. Passing null clears
  // pending_plan_code; auto_renew is left as-is (the RPC never mutates it).
  const clearScheduledDowngrade = async () => {
    if (!subscription) return;
    setClearingDowngrade(true);
    const { error } = await rawSupabase.rpc("tbank_schedule_plan_change", {
      p_subscription_id: subscription.id,
      p_target_plan_code: null,
    });
    setClearingDowngrade(false);
    if (error) {
      toast({ title: t("settings.billing.pendingDowngradeError"), variant: "destructive" });
      return;
    }
    trackEvent("billing_downgrade_cleared");
    toast({ title: t("settings.billing.pendingDowngradeCleared") });
    refetch();
  };

  if (isLoading) return null;

  if (!subscription || status === "none") {
    return (
      <SettingsSection
        title={t("settings.billing.subscriptionTitle")}
        description={t("settings.billing.noSubscription")}
      >
        <Button asChild>
          <Link to="/#pricing">{t("settings.billing.choosePlan")}</Link>
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

      {subscription.pending_plan_code ? (
        <div className="rounded-panel border border-border bg-muted/30 p-sp-2 space-y-sp-1">
          <p className="text-body-sm text-foreground">
            {t("settings.billing.pendingDowngrade", {
              plan:
                PLANS[subscription.pending_plan_code as keyof typeof PLANS]?.display_name ??
                subscription.pending_plan_code,
              date: endsAt ?? "—",
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={clearScheduledDowngrade}
            disabled={clearingDowngrade}
          >
            {t("settings.billing.pendingDowngradeKeep", { plan: planName })}
          </Button>
        </div>
      ) : null}

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
