import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Coins, Sparkles, ArrowUpRight } from "lucide-react";
import { BILLING_ENABLED } from "@/lib/billing";
import { SubscriptionSection } from "@/components/billing/SubscriptionSection";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { PlansDialog } from "@/components/billing/PlansDialog";
import { useTierQuota } from "@/hooks/useTierQuota";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { SignInPrompt } from "@/components/settings/SignInPrompt";
import { PLANS } from "@/data/plans";
import { TIER_LIMITS } from "@/data/tier-limits";

export function BillingPanel() {
  const { t, i18n } = useTranslation();
  const { data: quota, isLoading } = useTierQuota();
  const [plansOpen, setPlansOpen] = useState(false);
  const workspaceMode = useWorkspaceMode();
  // A logged-out visitor on a Supabase deployment (AppLayout doesn't redirect)
  // sees the default free-plan card; the upgrade CTA can't transact without a
  // session, so swap it for a sign-in nudge. Demo / local keep the CTA (the plan
  // comparison is part of the product showcase); pending-supabase is transient.
  const needsSignIn = workspaceMode.kind === "guest";

  // Plan comes from the active subscription (get_current_usage), the billing
  // source of truth — not the legacy profiles.plan field.
  const planCode = quota?.plan_code ?? "free";
  const planLabel = PLANS[planCode]?.display_name ?? planCode;
  const canUpgrade = planCode !== "brigade";
  // Per-project participant (editor) seats: a static per-tier allowance, since
  // get_current_usage exposes no live member count. -1 renders as the ∞ label.
  const participantSeats = TIER_LIMITS[planCode]?.editors_per_project ?? 0;
  const participantsAllowance =
    participantSeats < 0 ? t("quota.meter.unlimited") : String(participantSeats);

  return (
    <div className="space-y-sp-3">
      {/* "Тарифы": current plan, plan comparison, and AI usage/limits (merged
          from the former Подписка plan-facts + Биллинг blocks). */}
      <SettingsSection title={t("billing.title")} description={t("billing.description")}>
        {/* Current plan */}
        <Card>
          <CardContent className="p-sp-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="h-9 w-9 rounded-panel bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-body-sm font-semibold text-foreground">
                {t("billing.planSuffix", { plan: planLabel })}
              </p>
              <p className="text-caption text-muted-foreground">{t("billing.currentTier")}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto sm:shrink-0"
              onClick={() => { trackEvent("billing_panel_compare_plans_clicked"); setPlansOpen(true); }}
            >
              {t("billing.comparePlans")}
            </Button>
          </CardContent>
        </Card>

        {/* Usage + tier limits (real quota from get_current_usage) */}
        <div className="space-y-sp-2">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-accent" />
              <p className="text-body-sm font-semibold text-foreground">{t("quota.section.title")}</p>
            </div>
            {quota?.period_end && (
              <span className="text-caption text-muted-foreground">
                {t("quota.meter.renews", {
                  date: new Date(quota.period_end).toLocaleDateString(i18n.language),
                })}
              </span>
            )}
          </div>

          {isLoading && !quota && <Skeleton className="h-24 w-full" />}
          {quota && (
            <div className="space-y-sp-2">
              <UsageMeter
                title={t("quota.meter.chat")}
                used={quota.ai_chat_used}
                limit={quota.ai_chat_limit}
              />
              <UsageMeter
                title={t("quota.meter.doc")}
                used={quota.ai_doc_used}
                limit={quota.ai_doc_limit}
              />
              <UsageMeter
                title={t("quota.meter.photo")}
                used={quota.ai_photo_used}
                limit={quota.ai_photo_limit}
              />
              <UsageMeter
                title={t("quota.meter.estimates")}
                used={quota.estimates_used}
                limit={quota.estimates_limit}
              />
              {/* Participants = per-project editor seats; a static per-tier
                  allowance, not a consumption meter. Rendered via UsageMeter's
                  allowance mode so its typography matches the meters exactly. */}
              <UsageMeter
                title={t("quota.meter.participants")}
                allowanceLabel={participantsAllowance}
              />
            </div>
          )}

          {needsSignIn ? (
            <div className="pt-sp-1">
              <SignInPrompt hint={t("billing.signInHint")} ctaLabel={t("billing.signIn")} />
            </div>
          ) : canUpgrade ? (
            <div className="flex flex-wrap gap-sp-2 pt-sp-1">
              <Button
                className="w-full sm:w-auto"
                onClick={() => { trackEvent("billing_panel_upgrade_clicked", { plan: planCode }); setPlansOpen(true); }}
              >
                <ArrowUpRight className="h-4 w-4 mr-1.5" />
                {t("billing.upgradePlan")}
              </Button>
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {/* "Подписка": payments, attached card, period, price, cancel/resume.
          Hidden until the billing flag is on, so prod (flag off) is unchanged.
          Placed last so the quiet cancel link sits at the bottom of the page. */}
      {BILLING_ENABLED ? <SubscriptionSection /> : null}

      <PlansDialog open={plansOpen} onOpenChange={setPlansOpen} currentPlan={planCode} />
    </div>
  );
}
