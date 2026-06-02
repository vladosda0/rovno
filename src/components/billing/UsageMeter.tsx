import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  title: string;
  used: number;
  limit: number;
}

// One labelled progress bar for a usage slot, showing how much is REMAINING
// (not how much is used) — a fresh free plan reads "50 left" with a full bar,
// rather than "0 of 50" with an empty bar that looks exhausted. limit < 0 means
// unlimited. The shared renewal date is shown once beside the section header,
// not per meter.
export function UsageMeter({ title, used, limit }: UsageMeterProps) {
  const { t } = useTranslation();
  const unlimited = limit < 0;
  const remaining = unlimited ? 0 : Math.max(limit - used, 0);
  // Bar fills with what's LEFT: full when nothing used, empty when exhausted.
  // limit < 0 = unlimited (no bar). limit === 0 = a zero allowance → empty bar,
  // not a full 100% bar that would misread as "available".
  const remainingPct = unlimited
    ? 100
    : limit <= 0
    ? 0
    : Math.round((remaining / limit) * 100);
  const atLimit = !unlimited && remaining <= 0;
  const low = !unlimited && !atLimit && remainingPct <= 10;

  return (
    <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-foreground">{title}</span>
        <span
          className={cn(
            "text-caption font-medium tabular-nums",
            atLimit
              ? "text-destructive"
              : low
              ? "text-warning"
              : "text-muted-foreground",
          )}
        >
          {unlimited
            ? t("quota.meter.unlimited")
            : t("quota.meter.remaining", { remaining, limit })}
        </span>
      </div>
      {!unlimited && <Progress value={remainingPct} className="h-2" />}
    </div>
  );
}
