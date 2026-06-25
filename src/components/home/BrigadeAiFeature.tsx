import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Sparkles, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";
import { planMeets } from "@/hooks/useTierQuota";
import { PLANS } from "@/data/plans";
import { formatRubFromKopecks } from "@/lib/billing";
import { trackEvent } from "@/lib/analytics";

interface Props {
  /** Section title shown beside the AI-experimental badge. */
  title: string;
  /** Analytics tag for the upgrade CTA. */
  feature: string;
  children: ReactNode;
}

/**
 * Wraps an AI-experimental portfolio feature: always shows the "ИИ · эксперимент" badge,
 * renders the feature only on the «Бригада» plan, and otherwise shows a locked upsell card.
 * Demo/local mode has no subscription → treated as free → locked (with the upgrade CTA).
 */
export function BrigadeAiFeature({ title, feature, children }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subscription, status, isLoading } = useActiveSubscription();
  const planCode = subscription?.plan_code ?? "free";
  // Eligible only on the Brigade plan AND while the subscription is live (active or in the
  // grace window). A lapsed/expired brigade row keeps its plan_code, so gating on the plan
  // alone would leak the features to a non-paying user (§15.5 soft-block).
  const eligible = planMeets(planCode, "brigade") && (status === "active" || status === "grace");

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
      <Badge variant="secondary" className="gap-1 text-[13px]">
        <Sparkles className="h-3 w-3" />
        {t("financeTab.aiExperimental")}
      </Badge>
    </div>
  );

  return (
    <div className="space-y-2">
      {header}
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
      ) : eligible ? (
        children
      ) : (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4 text-center">
          <Lock className="mx-auto h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-[15px] text-muted-foreground">
            {t("financeTab.brigadeOnly")}
          </p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              trackEvent("portfolio_feature_upgrade_clicked", { feature, plan: planCode });
              navigate("/billing/checkout?plan=brigade");
            }}
          >
            {t("financeTab.upgradeToBrigade", { price: formatRubFromKopecks(PLANS.brigade.amount_kopecks) })}
          </Button>
        </div>
      )}
    </div>
  );
}
