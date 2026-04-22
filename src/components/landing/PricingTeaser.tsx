import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PlanCard {
  id: "free" | "pro" | "business" | "enterprise";
  featureCount: number;
  popular?: boolean;
}

const plans: PlanCard[] = [
  { id: "free", featureCount: 4 },
  { id: "pro", featureCount: 5, popular: true },
  { id: "business", featureCount: 5 },
  { id: "enterprise", featureCount: 5 },
];

export function PricingTeaser() {
  const { t } = useTranslation();
  return (
    <section className="max-w-5xl mx-auto">
      <h2 className="text-h2 text-foreground text-center mb-sp-1">{t("pricingTeaser.title")}</h2>
      <p className="text-body text-muted-foreground text-center mb-sp-4">{t("pricingTeaser.subtitle")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-sp-3">
        {plans.map((plan) => {
          const features = Array.from({ length: plan.featureCount }, (_, i) =>
            t(`pricingTeaser.plans.${plan.id}.f${i + 1}`),
          );
          return (
            <div
              key={plan.id}
              className={`glass rounded-card p-sp-3 flex flex-col relative ${
                plan.popular ? "ring-2 ring-accent" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption font-medium bg-accent text-accent-foreground">
                  {t("pricingTeaser.popular")}
                </span>
              )}
              <h3 className="text-body font-semibold text-foreground">{t(`pricingTeaser.plans.${plan.id}.name`)}</h3>
              <div className="mt-sp-1 mb-sp-2">
                <span className="text-h2 font-bold text-foreground">{t(`pricingTeaser.plans.${plan.id}.price`)}</span>
                <span className="text-body-sm text-muted-foreground">{t(`pricingTeaser.plans.${plan.id}.period`)}</span>
              </div>
              <ul className="space-y-1.5 mb-sp-3 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-body-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-success mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={plan.popular ? "bg-accent text-accent-foreground hover:bg-accent/90 w-full" : "w-full"}
                variant={plan.popular ? "default" : "outline"}
              >
                <Link to="/auth/signup">{t(`pricingTeaser.plans.${plan.id}.cta`)}</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
