import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { trackEvent } from "@/lib/analytics";
import { PLANS, type PlanCode } from "@/data/plans";
import { BILLING_ENABLED, formatRubFromKopecks } from "@/lib/billing";
import { PlanCard, type FeatureGroup } from "./PlanCard";

// Struck-through "regular" price shown before the start price. This is marketing
// copy, NOT the contractual amount — the source of truth for billing stays
// @/data/plans (sync-checked against the backend). Hardcoded here on purpose so
// display-only data does not widen the shared plan contract.
const ORIGINAL_PRICES_KOPECKS: Record<PlanCode, number> = {
  master: 169000, // 1 690 ₽
  brigade: 420000, // 4 200 ₽
};

export function PricingBlock({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status } = useRuntimeAuth();
  const isAuthenticated = status === "authenticated";

  const freeGroups: FeatureGroup[] = [
    {
      icon: "🤖",
      items: [
        { text: t("pricing.plans.free.ai.title"), bold: true },
        { text: t("pricing.plans.free.ai.chat") },
        { text: t("pricing.plans.free.ai.doc") },
        { text: t("pricing.plans.free.ai.photo") },
      ],
    },
    { icon: "👤", items: [{ text: t("pricing.plans.free.users"), bold: true }] },
    { icon: "📊", items: [{ text: t("pricing.plans.free.estimates"), bold: true }] },
  ];

  const masterGroups: FeatureGroup[] = [
    {
      icon: "🤖",
      items: [
        { text: t("pricing.plans.master.ai.title"), bold: true },
        { text: t("pricing.plans.master.ai.chat") },
        { text: t("pricing.plans.master.ai.doc") },
        { text: t("pricing.plans.master.ai.photo") },
      ],
    },
    {
      icon: "📱",
      items: [
        {
          text: t("pricing.plans.master.telegram"),
          note: t("pricing.plans.master.telegramNote"),
          bold: true,
        },
      ],
    },
    { icon: "👥", items: [{ text: t("pricing.plans.master.users"), bold: true }] },
    { icon: "👀", items: [{ text: t("pricing.plans.master.guests"), bold: true }] },
    {
      icon: "📊",
      items: [
        {
          text: t("pricing.plans.master.estimates"),
          note: t("pricing.plans.master.estimatesNote"),
          bold: true,
        },
      ],
    },
  ];

  const brigadeGroups: FeatureGroup[] = [
    {
      icon: "🤖",
      items: [
        { text: t("pricing.plans.brigade.ai.title"), bold: true },
        { text: t("pricing.plans.brigade.ai.chat") },
        { text: t("pricing.plans.brigade.ai.doc") },
        { text: t("pricing.plans.brigade.ai.photo") },
      ],
    },
    {
      icon: "📱",
      items: [
        {
          text: t("pricing.plans.brigade.telegram"),
          note: t("pricing.plans.brigade.telegramNote"),
          bold: true,
        },
      ],
    },
    { icon: "👥", items: [{ text: t("pricing.plans.brigade.users"), bold: true }] },
    { icon: "🏢", items: [{ text: t("pricing.plans.brigade.org"), bold: true }] },
    {
      icon: "🪪",
      items: [
        {
          text: t("pricing.plans.brigade.profile"),
          note: t("pricing.plans.brigade.profileNote"),
          bold: true,
        },
      ],
    },
    { icon: "🚀", items: [{ text: t("pricing.plans.brigade.priority"), bold: true }] },
    { icon: "🔜", items: [{ text: t("pricing.plans.brigade.marketplace") }] },
  ];

  const handleSelectFree = () => {
    trackEvent("billing_plan_selected", { plan: "free" });
    // Logged-in users land on their plan/usage page rather than a generic home.
    navigate(isAuthenticated ? "/settings?tab=billing" : "/auth/signup");
  };

  const handleSelectPaid = (code: PlanCode) => {
    trackEvent("billing_plan_selected", { plan: code });
    const checkout = `/billing/checkout?plan=${code}`;
    if (!isAuthenticated) {
      navigate(`/auth/signup?next=${encodeURIComponent(checkout)}`);
      return;
    }
    // When checkout is live, go straight to purchase; otherwise land on the
    // Settings billing page (plan + usage limits + upgrade) instead of
    // dead-ending — /billing/checkout redirects to /pricing while billing is off.
    navigate(BILLING_ENABLED ? checkout : "/settings?tab=billing");
  };

  return (
    <div className={className}>
      <div className="grid w-full auto-rows-fr grid-cols-1 gap-sp-3 md:grid-cols-3">
        <PlanCard
          name={t("pricing.plans.free.name")}
          priceLabel={t("pricing.plans.free.priceLabel")}
          featureGroups={freeGroups}
          ctaLabel={t("pricing.cta.continue")}
          onCta={handleSelectFree}
        />
        <PlanCard
          name={t("pricing.plans.master.name")}
          originalPriceLabel={formatRubFromKopecks(ORIGINAL_PRICES_KOPECKS.master)}
          priceLabel={formatRubFromKopecks(PLANS.master.amount_kopecks)}
          pricePeriodLabel={t("pricing.perMonth")}
          priceTooltip={t("pricing.priceTooltip")}
          featureGroups={masterGroups}
          ctaLabel={t("pricing.cta.continue")}
          onCta={() => handleSelectPaid("master")}
          recommendedBadge={t("pricing.recommendedBadge")}
          highlighted
        />
        <PlanCard
          name={t("pricing.plans.brigade.name")}
          originalPriceLabel={formatRubFromKopecks(ORIGINAL_PRICES_KOPECKS.brigade)}
          priceLabel={formatRubFromKopecks(PLANS.brigade.amount_kopecks)}
          pricePeriodLabel={t("pricing.perMonth")}
          priceTooltip={t("pricing.priceTooltip")}
          featureGroups={brigadeGroups}
          ctaLabel={t("pricing.cta.continue")}
          onCta={() => handleSelectPaid("brigade")}
        />
      </div>

      <div className="mt-sp-4 rounded-panel border border-border bg-muted/30 p-sp-3">
        <p className="text-body-sm font-semibold text-foreground">
          {t("pricing.allIncluded.title")}
        </p>
        <ul className="mt-2 grid gap-1 text-body-sm text-muted-foreground md:grid-cols-2">
          <li>✓ {t("pricing.allIncluded.f1")}</li>
          <li>✓ {t("pricing.allIncluded.f2")}</li>
          <li>✓ {t("pricing.allIncluded.f3")}</li>
          <li>✓ {t("pricing.allIncluded.f4")}</li>
          <li>✓ {t("pricing.allIncluded.f5")}</li>
        </ul>
      </div>

      <div className="mt-sp-3 flex justify-center text-center text-caption text-muted-foreground">
        <Link
          to="/promo/redeem"
          className="underline hover:text-foreground"
          onClick={() => trackEvent("promo_redeem_link_clicked")}
        >
          {t("pricing.promoLink")}
        </Link>
      </div>
    </div>
  );
}
