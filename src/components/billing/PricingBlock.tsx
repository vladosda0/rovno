import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { trackEvent } from "@/lib/analytics";
import { PLANS, type PlanCode } from "@/data/plans";
import { BILLING_ENABLED, formatRubFromKopecks } from "@/lib/billing";
import { BetaCountdown } from "./BetaCountdown";
import { PlanCard } from "./PlanCard";

interface PaidPlanDef {
  code: PlanCode;
  nameKey: string;
  descriptionKey: string;
  featureKeys: string[];
}

// Display metadata for the catalogue. Prices/codes come from @/data/plans (the
// sync-checked source of truth); names/descriptions/features are localized i18n.
const PAID_PLANS: PaidPlanDef[] = [
  {
    code: "master",
    nameKey: "pricing.plans.master.name",
    descriptionKey: "pricing.plans.master.description",
    featureKeys: [
      "pricing.plans.master.everythingIn",
      "pricing.plans.master.f1",
      "pricing.plans.master.f2",
      "pricing.plans.master.f5",
      "pricing.plans.master.f6",
    ],
  },
  {
    code: "brigade",
    nameKey: "pricing.plans.brigade.name",
    descriptionKey: "pricing.plans.brigade.description",
    featureKeys: [
      "pricing.plans.brigade.everythingIn",
      "pricing.plans.brigade.f1",
      "pricing.plans.brigade.f2",
      "pricing.plans.brigade.f3",
      "pricing.plans.brigade.f4",
    ],
  },
];

const FREE_FEATURE_KEYS = [
  "pricing.plans.free.f1",
  "pricing.plans.free.f2",
  "pricing.plans.free.f3",
  "pricing.plans.free.f4",
  "pricing.plans.free.f5",
  "pricing.plans.free.f6",
];

export function PricingBlock({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status } = useRuntimeAuth();
  const isAuthenticated = status === "authenticated";

  const handleSelectFree = () => {
    trackEvent("billing_plan_selected", { plan: "free" });
    navigate(isAuthenticated ? "/home" : "/auth/signup");
  };

  const handleSelectPaid = (code: PlanCode) => {
    trackEvent("billing_plan_selected", { plan: code });
    // CTA is disabled when billing is off, so this should not fire then.
    if (!BILLING_ENABLED) return;
    const target = `/billing/checkout?plan=${code}`;
    navigate(isAuthenticated ? target : `/auth/signup?return=${encodeURIComponent(target)}`);
  };

  return (
    <div className={className}>
      <BetaCountdown />
      <div className="grid w-full auto-rows-fr grid-cols-1 gap-sp-3 md:grid-cols-3">
        <PlanCard
          name={t("pricing.plans.free.name")}
          description={t("pricing.plans.free.description")}
          priceLabel={t("pricing.plans.free.priceLabel")}
          features={FREE_FEATURE_KEYS.map((key) => t(key))}
          ctaLabel={t("pricing.cta.start")}
          onCta={handleSelectFree}
          highlighted
        />
        {PAID_PLANS.map((plan) => (
          <PlanCard
            key={plan.code}
            name={t(plan.nameKey)}
            description={t(plan.descriptionKey)}
            priceLabel={formatRubFromKopecks(PLANS[plan.code].amount_kopecks)}
            pricePeriodLabel={t("pricing.perMonth")}
            features={plan.featureKeys.map((key) => t(key))}
            ctaLabel={BILLING_ENABLED ? t("pricing.cta.continue") : t("pricing.cta.soon")}
            onCta={() => handleSelectPaid(plan.code)}
            ctaDisabled={!BILLING_ENABLED}
            showSoonBadge={!BILLING_ENABLED}
          />
        ))}
      </div>
    </div>
  );
}
