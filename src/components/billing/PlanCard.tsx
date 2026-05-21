import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export interface PlanCardProps {
  name: string;
  description: string;
  priceLabel: string;
  pricePeriodLabel?: string;
  features: string[];
  ctaLabel: string;
  onCta?: () => void;
  ctaDisabled?: boolean;
  highlighted?: boolean;
  showSoonBadge?: boolean;
}

export function PlanCard({
  name,
  description,
  priceLabel,
  pricePeriodLabel,
  features,
  ctaLabel,
  onCta,
  ctaDisabled,
  highlighted,
  showSoonBadge,
}: PlanCardProps) {
  const { t } = useTranslation();

  return (
    <article
      className={`flex h-full flex-col rounded-panel p-sp-3 ${
        highlighted ? "glass border border-accent/30" : "glass border border-border"
      } ${showSoonBadge ? "opacity-75" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-foreground">{name}</h3>
        {showSoonBadge ? (
          <span className="inline-flex items-center rounded-pill border border-border bg-muted/60 px-2.5 py-1 text-caption text-muted-foreground">
            {t("pricing.soonBadge")}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-body-sm text-muted-foreground">{description}</p>

      <div className="mt-3 flex items-baseline gap-1">
        <p className="text-h2 font-bold text-foreground">{priceLabel}</p>
        {pricePeriodLabel ? (
          <span className="text-body-sm text-muted-foreground">{pricePeriodLabel}</span>
        ) : null}
      </div>

      <div className="mt-3">
        <Button
          onClick={onCta}
          disabled={ctaDisabled}
          variant={ctaDisabled ? "outline" : "default"}
          className={`w-full ${ctaDisabled ? "" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
        >
          {ctaLabel}
        </Button>
      </div>

      <ul className="mt-3 flex-1 space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-body-sm text-muted-foreground"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
