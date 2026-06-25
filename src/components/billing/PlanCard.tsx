import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FeatureGroupItem {
  // One line within a group. `text` is the (optionally bold) lead; `note` is an
  // inline normal-weight continuation; `subItems` render as a sub-bullet list.
  text: string;
  note?: string;
  subItems?: string[];
  bold?: boolean;
}

export interface FeatureGroup {
  // A group of features anchored by an emoji icon (e.g. "🤖" for the AI block).
  icon: string;
  items: FeatureGroupItem[];
}

export interface PlanCardProps {
  name: string;
  description?: string;
  priceLabel: string;
  // Struck-through "regular" price shown above priceLabel (founding-price marketing).
  originalPriceLabel?: string;
  pricePeriodLabel?: string;
  // Note revealed on hover/focus of the price (e.g. start-price terms).
  priceTooltip?: string;
  featureGroups: FeatureGroup[];
  ctaLabel: string;
  onCta?: () => void;
  ctaDisabled?: boolean;
  highlighted?: boolean;
  // Accent pill shown by the name (e.g. "РЕКОМЕНДУЕМ"): inline to the right on the
  // mobile and lg+ layouts, stacked above the name only on the narrow md 3-column
  // layout (where inline would bleed).
  recommendedBadge?: string;
  showSoonBadge?: boolean;
}

export function PlanCard({
  name,
  description,
  priceLabel,
  originalPriceLabel,
  pricePeriodLabel,
  priceTooltip,
  featureGroups,
  ctaLabel,
  onCta,
  ctaDisabled,
  highlighted,
  recommendedBadge,
  showSoonBadge,
}: PlanCardProps) {
  const { t } = useTranslation();

  const badgeLabel = recommendedBadge ?? (showSoonBadge ? t("pricing.soonBadge") : null);
  const badgeIsAccent = Boolean(recommendedBadge);
  const badgePill = `items-center rounded-pill px-2 py-0.5 text-[10px] font-medium ${
    badgeIsAccent
      ? "bg-accent text-accent-foreground"
      : "border border-border bg-muted/60 text-muted-foreground"
  }`;

  // Struck original price sits on its own line; plans without one reserve the same
  // line (nbsp) so the price baseline — and therefore the CTA and feature rows —
  // line up across cards at every screen width. The main price never wraps.
  const priceBlock = (
    <>
      <div className="text-body-sm leading-tight text-muted-foreground">
        {originalPriceLabel ? (
          <span className="line-through">{originalPriceLabel}</span>
        ) : (
          "\u00A0"
        )}
      </div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-h2 font-bold text-foreground">{priceLabel}</span>
        {pricePeriodLabel ? (
          <span className="text-body-sm text-muted-foreground">{pricePeriodLabel}</span>
        ) : null}
      </div>
    </>
  );

  return (
    <article
      className={`flex h-full flex-col rounded-panel p-sp-3 ${
        highlighted ? "glass border border-accent/30" : "glass border border-border"
      } ${showSoonBadge ? "opacity-75" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-foreground">{name}</h3>
        {/* Always inline to the right of the name; sized small so it never bleeds
            as the card narrows, keeping every card's rows aligned. */}
        {badgeLabel ? (
          <span className={`inline-flex shrink-0 ${badgePill}`}>{badgeLabel}</span>
        ) : null}
      </div>

      {description ? (
        <p className="mt-2 text-body-sm text-muted-foreground">{description}</p>
      ) : null}

      <div className="mt-3">
        {priceTooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className="w-fit cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {priceBlock}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[16rem] text-center">
                {priceTooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div>{priceBlock}</div>
        )}
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

      <ul className="mt-4 flex-1 space-y-3">
        {featureGroups.map((group) => (
          <li key={group.icon} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-0.5 shrink-0 text-body leading-none">
              {group.icon}
            </span>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div key={item.text} className="text-body-sm text-foreground">
                  <span className={item.bold ? "font-semibold" : undefined}>{item.text}</span>
                  {item.note ? ` ${item.note}` : null}
                  {item.subItems && item.subItems.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5 pl-3">
                      {item.subItems.map((sub) => (
                        <li key={sub} className="text-caption text-muted-foreground">
                          {sub}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
