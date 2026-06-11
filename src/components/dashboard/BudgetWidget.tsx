import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatCompactMoney } from "@/lib/estimate-v2/format-money";
import { formatPct } from "@/lib/finance/format";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";
import { cn } from "@/lib/utils";

interface Props {
  summary: EstimateV2FinanceProjectSummary | null;
  projectId: string;
  isLoading?: boolean;
  className?: string;
}

function MiniCard({
  label,
  value,
  sub,
  subClassName,
}: {
  label: string;
  value: string;
  sub?: string | null;
  subClassName?: string;
}) {
  return (
    <div className="rounded-panel bg-muted/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[13px] font-medium tabular-nums text-foreground">{value}</p>
      {sub ? <p className={cn("text-[11px] text-muted-foreground", subClassName)}>{sub}</p> : null}
    </div>
  );
}

export function BudgetWidget({ summary, projectId, isLoading, className }: Props) {
  const { t } = useTranslation();

  // Skeleton during workspace hydration so the empty CTA never flashes before data lands.
  if (isLoading && !summary?.hasEstimate) {
    return (
      <div className={cn("glass rounded-card p-sp-2 space-y-3", className)}>
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" /> {t("budgetWidget.title")}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-panel bg-muted/40" />
          ))}
        </div>
        <div className="h-1.5 animate-pulse rounded-full bg-muted/40" />
      </div>
    );
  }

  if (!summary?.hasEstimate) {
    return (
      <div className={cn("glass rounded-card p-sp-2 space-y-3", className)}>
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" /> {t("budgetWidget.title")}
        </h3>
        <p className="text-body-sm text-muted-foreground">
          {t("budgetWidget.emptyDescription")}
        </p>
        <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to={`/project/${projectId}/estimate`}>{t("budgetWidget.startPlanning")}</Link>
        </Button>
      </div>
    );
  }

  const currency = summary.currency;
  const overspend = summary.spentCents > 0 && summary.spentCents > summary.costCents;
  const utilizationProgress = summary.percentUtilization == null
    ? 0
    : Math.max(0, Math.min(100, summary.percentUtilization));

  const termValue = summary.daysToEnd != null
    ? t("estimate.summary.dayUnit", { count: summary.daysToEnd })
    : "—";
  const termSub = summary.behindScheduleDays > 0
    ? t("budgetWidget.behind", { days: summary.behindScheduleDays })
    : summary.daysToEnd == null
      ? t("estimate.finance.noDates")
      : null;

  return (
    <div className={cn("glass rounded-card p-sp-2", className)}>
      <div className="flex items-center justify-between gap-2 mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2 min-w-0">
          <Wallet className="h-4 w-4 shrink-0 text-accent" /> {t("budgetWidget.title")}
        </h3>
        <Link
          to={`/project/${projectId}/estimate`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent hover:bg-accent/10 transition-colors"
          aria-label="Manage budget"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <MiniCard
          label={t("budgetWidget.revenue")}
          value={formatCompactMoney(summary.contractValueCents, currency)}
        />
        <MiniCard
          label={t("budgetWidget.marginPct")}
          value={formatPct(summary.percentProfitability, 1)}
          sub={`${t("budgetWidget.margin")}: ${formatCompactMoney(summary.marginCents, currency)}`}
        />
        <MiniCard
          label={t("budgetWidget.utilization")}
          value={formatPct(summary.percentUtilization, 0)}
          sub={`${t("budgetWidget.spent")}: ${formatCompactMoney(summary.spentCents, currency)}`}
          subClassName={overspend ? "text-destructive" : undefined}
        />
        <MiniCard
          label={t("budgetWidget.term")}
          value={termValue}
          sub={termSub}
          subClassName={summary.behindScheduleDays > 0 ? "text-destructive" : undefined}
        />
      </div>

      <Progress
        value={utilizationProgress}
        className="h-1.5 bg-muted"
        indicatorClassName={overspend ? "bg-destructive" : "bg-foreground"}
      />
    </div>
  );
}
