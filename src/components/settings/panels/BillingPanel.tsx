import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@/lib/analytics";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Coins, CreditCard, Sparkles } from "lucide-react";
import { BILLING_ENABLED } from "@/lib/billing";
import { SubscriptionSection } from "@/components/billing/SubscriptionSection";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { useTierQuota } from "@/hooks/useTierQuota";

const PLAN_KEYS: Record<string, string> = {
  free: "billing.plan.free",
  pro: "billing.plan.pro",
  business: "billing.plan.business",
};

export function BillingPanel() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { data: quota } = useTierQuota();
  const planLabel = PLAN_KEYS[user.plan] ? t(PLAN_KEYS[user.plan]) : user.plan;

  return (
    <div className="space-y-sp-3">
      {/* Real T-Bank subscription management (phase 1c). Hidden until the
          billing flag is on; the credits panel below is the existing surface. */}
      {BILLING_ENABLED ? <SubscriptionSection /> : null}

      <SettingsSection title={t("billing.title")} description={t("billing.description")}>
        {/* Plan card */}
        <Card>
          <CardContent className="p-1.5 px-sp-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="h-9 w-9 rounded-panel bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-body font-semibold text-foreground">
                  {t("billing.planSuffix", { plan: planLabel })}
                </p>
                <Badge variant="secondary" className="text-[10px] capitalize">{user.plan}</Badge>
              </div>
              <p className="text-caption text-muted-foreground">{t("billing.currentTier")}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full sm:w-auto sm:shrink-0" onClick={() => { trackEvent("billing_panel_compare_plans_clicked"); navigate("/#pricing"); }}>{t("billing.comparePlans")}</Button>
          </CardContent>
        </Card>

        {/* AI usage this period (real tier quota from get_current_usage) */}
        <div className="space-y-sp-2">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-accent" />
            <p className="text-body-sm font-semibold text-foreground">{t("quota.section.title")}</p>
          </div>

          {quota && (
            <div className="space-y-sp-2">
              <UsageMeter
                title={t("quota.meter.chat")}
                used={quota.ai_chat_used}
                limit={quota.ai_chat_limit}
                periodEnd={quota.period_end}
              />
              <UsageMeter
                title={t("quota.meter.doc")}
                used={quota.ai_doc_used}
                limit={quota.ai_doc_limit}
                periodEnd={quota.period_end}
              />
              <UsageMeter
                title={t("quota.meter.photo")}
                used={quota.ai_photo_used}
                limit={quota.ai_photo_limit}
                periodEnd={quota.period_end}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-sp-2 pt-sp-1">
            <Button className="w-full sm:w-auto" onClick={() => { trackEvent("billing_panel_purchase_credits_clicked"); navigate("/#pricing"); }}>
              <CreditCard className="h-4 w-4 mr-1.5" />
              {t("billing.purchase")}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
