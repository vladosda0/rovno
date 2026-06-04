import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";
import { useCardOnFile } from "@/hooks/useCardOnFile";
import { PaymentHistory } from "@/components/billing/PaymentHistory";
import { CancelSubscriptionDialog } from "@/components/billing/CancelSubscriptionDialog";
import { PLANS } from "@/data/plans";
import { formatRubFromKopecks } from "@/lib/billing";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

// tbank RPC is not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

// "Подписка" block: the billing-account facts (period, price, card on file,
// payment history) plus cancel/resume at the bottom. Plan & limits live in the
// separate "Тарифы" block (BillingPanel). Rendered by BillingPanel only when
// BILLING_ENABLED, so prod (flag off) behavior is unchanged.
export function SubscriptionSection() {
  const { t, i18n } = useTranslation();
  const { subscription, status, readOnly, isLoading, refetch } = useActiveSubscription();
  const { data: card } = useCardOnFile();
  const [clearingDowngrade, setClearingDowngrade] = useState(false);
  const [reactivating, setReactivating] = useState(false);

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

  // Resume a cancelled subscription: turn auto-renew back on. With the toggle
  // gone, cancel (auto_renew off) and resume (auto_renew on) are the only
  // recurrence controls.
  const reactivate = async () => {
    if (!subscription) return;
    setReactivating(true);
    const { error } = await rawSupabase.rpc("tbank_set_auto_renew", {
      p_subscription_id: subscription.id,
      p_auto_renew: true,
    });
    setReactivating(false);
    if (error) {
      toast({ title: t("settings.billing.autoRenewError"), variant: "destructive" });
      return;
    }
    toast({ title: t("settings.billing.autoRenewOnDone") });
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

  const currentPlanName =
    PLANS[subscription.plan_code as keyof typeof PLANS]?.display_name ?? subscription.plan_code;
  const priceLabel =
    subscription.amount_cents != null ? formatRubFromKopecks(subscription.amount_cents) : "—";
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
  // Card on file = the masked last-4 + brand from get_card_on_file (the saved
  // mandate persists across cancel/resume, so we show it whenever a card exists,
  // independent of auto_renew).
  const cardLabel = card ? [card.brand, `•••• ${card.last4}`].filter(Boolean).join(" ") : null;

  return (
    <SettingsSection
      title={t("settings.billing.subscriptionTitle")}
      description={t("settings.billing.subscriptionDescription")}
    >
      <Card>
        <CardContent className="space-y-sp-2 p-sp-2">
          {subscription.plan_code !== "free" ? (
            <div className="flex justify-between gap-2 text-body-sm">
              <span className="text-muted-foreground">{t("settings.billing.period")}</span>
              <span className="text-foreground">{periodLabel}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-2 text-body-sm">
            <span className="text-muted-foreground">{t("settings.billing.price")}</span>
            <span className="font-medium text-foreground">
              {priceLabel}
              {t("pricing.perMonth")}
            </span>
          </div>
          {cardLabel ? (
            <div className="flex justify-between gap-2 text-body-sm">
              <span className="text-muted-foreground">{t("settings.billing.cardLabel")}</span>
              <span className="inline-flex items-center gap-1.5 text-foreground tabular-nums">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                {cardLabel}
              </span>
            </div>
          ) : null}
          {status === "grace" && endsAt ? (
            <p className="text-caption text-warning">{t("settings.billing.graceNote", { date: endsAt })}</p>
          ) : null}
          {readOnly ? (
            <p className="text-caption text-destructive">{t("settings.billing.readOnlyNote")}</p>
          ) : null}
        </CardContent>
      </Card>

      {subscription.pending_plan_code && subscription.auto_renew ? (
        <div className="space-y-sp-1 rounded-panel border border-border bg-muted/30 p-sp-2">
          <p className="text-body-sm text-foreground">
            {t("settings.billing.pendingDowngrade", {
              plan:
                PLANS[subscription.pending_plan_code as keyof typeof PLANS]?.display_name ??
                subscription.pending_plan_code,
              date: endsAt ?? "—",
            })}
          </p>
          <button
            type="button"
            onClick={clearScheduledDowngrade}
            disabled={clearingDowngrade}
            className="text-caption font-medium text-accent underline underline-offset-2 hover:text-accent/80 disabled:opacity-50"
          >
            {t("settings.billing.pendingDowngradeKeep", { plan: currentPlanName })}
          </button>
        </div>
      ) : null}

      <div>
        <p className="mb-sp-1 text-body-sm font-semibold text-foreground">
          {t("settings.billing.history")}
        </p>
        <PaymentHistory />
      </div>

      {/* Cancel / resume sits at the very bottom as quiet inline text, not a
          bright button (per design pass): cancelling is rare and should not
          compete with the rest of the panel. */}
      <div className="flex flex-wrap items-center gap-sp-2 border-t border-border pt-sp-2">
        {subscription.auto_renew ? (
          <CancelSubscriptionDialog
            subscriptionId={subscription.id}
            activeUntilLabel={endsAt}
            onCancelled={refetch}
          />
        ) : (
          <>
            {endsAt ? (
              <p className="text-caption text-muted-foreground">
                {t("settings.billing.autoRenewOffNote", { date: endsAt })}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reactivate}
              disabled={reactivating}
              className="text-caption font-medium text-accent underline underline-offset-2 hover:text-accent/80 disabled:opacity-50"
            >
              {t("settings.billing.reactivate")}
            </button>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
