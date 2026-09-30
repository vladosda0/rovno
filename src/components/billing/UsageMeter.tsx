import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  title: string;
  used?: number;
  limit?: number;
  // Static allowance row (no progress bar): renders the title plus this value.
  // Used for per-tier seat allowances (e.g. participants) so they share the exact
  // same typography and padding as the consumption meters.
  allowanceLabel?: string;
  // Feature included in the plan but not in the product yet: greyed-out row
  // with a "Coming soon" pill instead of a "N of M left" figure and bar.
  soon?: boolean;
}

// One labelled progress bar for a usage slot, showing how much is REMAINING
// (not how much is used) — a fresh free plan reads "50 left" with a full bar,
// rather than "0 of 50" with an empty bar that looks exhausted. limit < 0 means
// unlimited. The bar is the brand blue and turns brand orange once under 20%
// remaining. The shared renewal date is shown once beside the section header.
export function UsageMeter({ title, used = 0, limit = 0, allowanceLabel, soon }: UsageMeterProps) {
  const { t } = useTranslation();

  if (soon) {
    return (
      <div data-soon="" className="space-y-1.5 rounded-panel bg-muted/40 p-1.5 px-sp-2 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm font-semibold text-muted-foreground">{title}</span>
          <span className="inline-flex shrink-0 rounded-pill border border-border bg-muted/60 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
            {t("pricing.soonBadge")}
          </span>
        </div>
      </div>
    );
  }

  // Allowance mode: a static labelled value, no bar (same shell as a meter).
  if (allowanceLabel !== undefined) {
    return (
      <div className="space-y-1.5 rounded-panel bg-muted/40 p-1.5 px-sp-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm font-semibold text-foreground">{title}</span>
          <span className="text-caption font-medium tabular-nums text-muted-foreground">
            {allowanceLabel}
          </span>
        </div>
      </div>
    );
  }

  const unlimited = limit < 0;
  const remaining = unlimited ? 0 : Math.max(limit - used, 0);
  // Bar fills with what's LEFT: full when nothing used, empty when exhausted.
  // limit < 0 = unlimited (no bar). limit === 0 = a zero allowance → empty bar,
  // not a full 100% bar that would misread as "available".
  const remainingPct = unlimited ? 100 : limit <= 0 ? 0 : Math.round((remaining / limit) * 100);
  // Under 20% remaining (including exhausted) reads as "running low": brand
  // orange on the bar and the figure. Otherwise brand blue / muted.
  const low = !unlimited && remainingPct < 20;

  return (
    <div className="space-y-1.5 rounded-panel bg-muted/40 p-1.5 px-sp-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-foreground">{title}</span>
        <span
          className={cn(
            "text-caption font-medium tabular-nums",
            low ? "text-warning" : "text-muted-foreground",
          )}
        >
          {unlimited
            ? t("quota.meter.unlimited")
            : t("quota.meter.remaining", { remaining, limit })}
        </span>
      </div>
      {!unlimited && (
        <Progress
          value={remainingPct}
          className="h-2"
          indicatorClassName={low ? "bg-warning" : "bg-accent"}
        />
      )}
    </div>
  );
}
