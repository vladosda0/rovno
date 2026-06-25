import { useTranslation } from "react-i18next";

import { KpiCard } from "@/components/finance/FinancePrimitives";
import { formatPct } from "@/lib/finance/format";
import { formatCompactMoney } from "@/lib/estimate-v2/format-money";
import { cn } from "@/lib/utils";
import type { PortfolioFinanceSnapshot } from "@/lib/finance/portfolio-read-model";

interface Props {
  snapshot: PortfolioFinanceSnapshot;
  currency: string;
}

/**
 * Overall progress weighted by contract value over detail-visible projects (spec §7.1 P1).
 * Falls back to the snapshot's simple average when there is no contract weight to apply.
 */
function weightedProgressPct(snapshot: PortfolioFinanceSnapshot): number | null {
  let weight = 0;
  let acc = 0;
  for (const project of snapshot.projects) {
    if (project.financeVisibility !== "detail") continue;
    const contract = project.contractValueCents ?? 0;
    if (contract <= 0 || project.percentComplete == null) continue;
    weight += contract;
    acc += project.percentComplete * contract;
  }
  if (weight > 0) return acc / weight;
  return snapshot.totals.avgPercentComplete;
}

export function PortfolioScorecard({ snapshot, currency }: Props) {
  const { t } = useTranslation();
  const { totals } = snapshot;
  const money = (cents: number) => formatCompactMoney(cents, currency);
  const overallProgress = weightedProgressPct(snapshot);

  return (
    <div className="space-y-3">
      {/* Hero: contracts (revenue) — bigger padding, same type scale. */}
      <div className="rounded-lg bg-muted/30 px-4 py-4">
        <p className="text-[15px] text-muted-foreground">{t("financeTab.contracts")}</p>
        <p className="text-2xl font-medium tabular-nums text-foreground">{money(totals.contractValueCents)}</p>
        {totals.redactedProjectCount > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {t("financeTab.redactedNote", { count: totals.redactedProjectCount })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label={t("financeTab.portfolioMargin")}
          value={formatPct(totals.marginPct, 1)}
          sub={money(totals.marginCents)}
          valueClassName={totals.marginCents < 0 ? "text-destructive" : undefined}
        />
        <KpiCard label={t("financeTab.cost")} value={money(totals.costCents)} />
        <KpiCard label={t("financeTab.activeProjects")} value={String(totals.activeCount)} />
        <KpiCard label={t("financeTab.overallProgress")} value={formatPct(overallProgress, 0)} />
        <KpiCard
          label={t("financeTab.atRisk")}
          value={String(totals.atRiskCount)}
          valueClassName={cn(totals.atRiskCount > 0 && "text-destructive")}
        />
      </div>
    </div>
  );
}
