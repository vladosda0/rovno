import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";
import { cn } from "@/lib/utils";

interface Props {
  summary: EstimateV2FinanceProjectSummary | null;
  projectId: string;
  className?: string;
}

function formatCurrency(valueCents: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

export function BudgetWidget({ summary, projectId, className }: Props) {
  const { t } = useTranslation();
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

  const totalPlanned = summary.plannedBudgetCents;
  const totalSpent = summary.spentCents;
  const toBePaid = summary.toBePaidCents;
  const profitabilityPct = summary.percentProfitability;
  const profitabilityLabel = profitabilityPct == null ? "—" : `${profitabilityPct.toFixed(1)}%`;
  const profitabilityProgress = profitabilityPct == null
    ? 0
    : Math.max(0, Math.min(100, profitabilityPct));
  const currency = summary.currency;

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
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">{t("budgetWidget.planned")}</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(totalPlanned, currency)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">{t("budgetWidget.spent")}</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(totalSpent, currency)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">{t("budgetWidget.toBePaid")}</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(toBePaid, currency)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">{t("budgetWidget.profitability")}</p>
          <p className="text-body-sm font-semibold text-foreground">{profitabilityLabel}</p>
        </div>
      </div>

      <Progress value={profitabilityProgress} className="h-1.5" />
    </div>
  );
}
