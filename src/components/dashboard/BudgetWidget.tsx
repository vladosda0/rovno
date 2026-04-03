import { Link } from "react-router-dom";
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
  if (!summary?.hasEstimate) {
    return (
      <div className={cn("glass rounded-card p-sp-2 space-y-3", className)}>
        <h3 className="text-body font-semibold text-foreground">Budget</h3>
        <p className="text-body-sm text-muted-foreground">
          Plan your budget to track spending and upcoming payments.
        </p>
        <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to={`/project/${projectId}/estimate`}>Start planning</Link>
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
        <h3 className="text-body font-semibold text-foreground">Budget</h3>
        <Button asChild size="sm" variant="outline" className="h-7 text-caption">
          <Link to={`/project/${projectId}/estimate`}>Manage</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">Planned</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(totalPlanned, currency)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">Spent</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(totalSpent, currency)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">To be paid</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(toBePaid, currency)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">% profitability</p>
          <p className="text-body-sm font-semibold text-foreground">{profitabilityLabel}</p>
        </div>
      </div>

      <Progress value={profitabilityProgress} className="h-1.5" />
    </div>
  );
}
