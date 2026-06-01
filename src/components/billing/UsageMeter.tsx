import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  title: string;
  used: number;
  limit: number;
  periodEnd?: string | null;
}

// One labelled progress bar for an AI usage slot. limit < 0 means unlimited.
export function UsageMeter({ title, used, limit, periodEnd }: UsageMeterProps) {
  const { t, i18n } = useTranslation();
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0
    ? 0
    : Math.min(Math.round((used / limit) * 100), 100);
  const atLimit = !unlimited && used >= limit;
  const near = !unlimited && !atLimit && pct >= 90;
  const renewLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString(i18n.language)
    : null;

  return (
    <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-foreground">{title}</span>
        <span
          className={cn(
            "text-caption font-medium tabular-nums",
            atLimit
              ? "text-destructive"
              : near
              ? "text-warning"
              : "text-muted-foreground",
          )}
        >
          {unlimited
            ? t("quota.meter.unlimited")
            : t("quota.meter.used", { used, limit })}
        </span>
      </div>
      {!unlimited && <Progress value={pct} className="h-2" />}
      {renewLabel && (
        <p className="text-caption text-muted-foreground">
          {t("quota.meter.renews", { date: renewLabel })}
        </p>
      )}
    </div>
  );
}
