import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { DetailRow, KpiCard } from "@/components/finance/FinancePrimitives";
import { formatPct, formatSignedPct } from "@/lib/finance/format";
import { UTILIZATION_RISK_GAP_PP } from "@/lib/finance/thresholds";
import { formatCompactMoney, formatMoney } from "@/lib/estimate-v2/format-money";
import type { EacForecast, FinishedAccuracy } from "@/lib/estimate-v2/finance-insights";
import type { EstimateOperationalUpperBlock } from "@/data/estimate-source";
import type { EstimateFinanceVisibilityMode } from "@/lib/permissions";
import type { EstimateExecutionStatus, ResourceLineType } from "@/types/estimate-v2";

const RESOURCE_TYPE_ORDER: ResourceLineType[] = [
  "material",
  "tool",
  "labor",
  "subcontractor",
  "overhead",
  "other",
];

/**
 * Pre-computed view-model for the top finance block. Every value already exists in
 * ProjectEstimate (pricing totals + fact rollups + timing); nothing is recomputed here
 * except the cost-based utilization ratio.
 */
export interface EstimateFinanceView {
  // Strip — cost basis
  revenueExVatCents: number;
  costTotalCents: number;
  profitExVatCents: number;
  profitabilityPct: number | null;
  // Execution
  hasActualFinancialData: boolean;
  spentCents: number;
  utilizationPct: number | null;
  overspendCents: number;
  completion: { done: number; total: number; pct: number | null };
  toBePaidPlannedCents: number;
  // Timing
  daysToEnd: number | null;
  behindScheduleDays: number;
  planningRangeLabel: string;
  planningDurationDays: number | null;
  // Commercial (details)
  markupTotalCents: number;
  subtotalBeforeDiscountCents: number;
  discountTotalCents: number;
  taxAmountCents: number;
  totalIncVatCents: number;
  // Plan/fact breakdown (details)
  plannedCostByTypeCents: Record<ResourceLineType, number>;
  spentByTypeCents: Record<ResourceLineType, number>;
  /** Spend that could not be attributed to a resource type; reconciles Σ fact with spentCents. */
  unattributedSpendCents: number;
  /** Cost forecast (details, in-work only); null under the early-stage guard. */
  eac: EacForecast | null;
  /** Fact-vs-plan accuracy for the finished strip; null until actual financial data exists. */
  finishedAccuracy: FinishedAccuracy | null;
  // Summary-mode plumbing
  operationalUpperBlock: EstimateOperationalUpperBlock | null;
  rpcSummaryTotalIncVatCents: number | null;
  uiTotalIncVatCents: number;
  taxBps: number;
  /**
   * True when HR reads are disabled for this role: spentCents excludes payroll
   * and is lower than the project truth. Spend renders must carry a marker.
   */
  spendExcludesHr: boolean;
}

interface EstimateFinanceHeaderProps {
  status: EstimateExecutionStatus;
  financeMode: EstimateFinanceVisibilityMode;
  useReadOnlySummaryPricing: boolean;
  currency: string;
  isContractorMode: boolean;
  view: EstimateFinanceView;
  resourceKeyLabel: (key: string) => string;
}

function bpsToPct(bps: number): string {
  return (bps / 100).toString();
}

export function EstimateFinanceHeader({
  status,
  financeMode,
  useReadOnlySummaryPricing,
  currency,
  isContractorMode,
  view,
  resourceKeyLabel,
}: EstimateFinanceHeaderProps) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dayUnit = (count: number) => t("estimate.summary.dayUnit", { count });

  // Collapse the details accordion whenever finance falls out of detail mode.
  useEffect(() => {
    if (financeMode !== "detail") setDetailsOpen(false);
  }, [financeMode, status]);

  if (financeMode === "none") {
    return (
      <div className="rounded-lg border border-border p-3">
        <p className="text-[15px] text-muted-foreground">{t("estimate.planning.financeHidden")}</p>
      </div>
    );
  }

  if (financeMode === "summary") {
    const ob = view.operationalUpperBlock;
    if (useReadOnlySummaryPricing && ob) {
      const summaryTotal = view.rpcSummaryTotalIncVatCents ?? view.uiTotalIncVatCents;
      const clientBreakdown = ob.resourceCostBreakdownClientSafeOnly ?? {};
      return (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {ob.clientTotalCents != null && (
              <KpiCard label={t("estimate.summary.clientTotalExVat")} value={formatCompactMoney(ob.clientTotalCents, currency)} />
            )}
            <KpiCard label={t("estimate.summary.vatRate")} value={`${bpsToPct(ob.vatBps ?? view.taxBps)}%`} />
            {ob.discountBps != null && ob.discountBps > 0 && (
              <KpiCard label={t("estimate.summary.discountMax")} value={`${bpsToPct(ob.discountBps)}%`} />
            )}
            <KpiCard label={t("estimate.summary.totalIncVat")} value={formatCompactMoney(summaryTotal, currency)} />
          </div>
          {Object.keys(clientBreakdown).length > 0 && (
            <div className="rounded-md bg-muted/30 px-3 py-2">
              <p className="text-[15px] text-muted-foreground">{t("estimate.summary.byResourceTypeClient")}</p>
              <div className="mt-1 space-y-1">
                {Object.entries(clientBreakdown).map(([key, cents]) => (
                  <div key={key} className="flex items-center justify-between text-[15px]">
                    <span className="text-muted-foreground">{resourceKeyLabel(key)}</span>
                    <span className="font-medium tabular-nums text-foreground">{formatMoney(cents, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    // Summary seam without a ready operational block: just the client grand total.
    return (
      <div className="rounded-lg border border-border p-3">
        <KpiCard label={t("estimate.summary.totalIncVat")} value={formatCompactMoney(view.uiTotalIncVatCents, currency)} />
      </div>
    );
  }

  // detail mode
  const showsExecution = status !== "planning";
  // Finished strip switches to fact-based totals (spec §7 Finished) once actual
  // financial data exists; without it we keep the generic execution layout.
  const finished = status === "finished" ? view.finishedAccuracy : null;
  const showsExecutionBar = showsExecution && !finished;
  const overspend = view.hasActualFinancialData && view.overspendCents > 0;
  const riskActive =
    view.hasActualFinancialData &&
    view.utilizationPct != null &&
    (view.utilizationPct > 100 ||
      (view.completion.pct != null && view.utilizationPct - view.completion.pct >= UTILIZATION_RISK_GAP_PP));

  let termValue: string;
  let termSub: string | null = null;
  let termSubDestructive = false;
  if (status === "planning") {
    termValue = view.planningDurationDays != null ? dayUnit(view.planningDurationDays) : "—";
    termSub =
      view.planningDurationDays == null
        ? t("estimate.finance.noDates")
        : view.planningRangeLabel !== "—"
          ? view.planningRangeLabel
          : null;
  } else if (finished) {
    termValue = finished.durationFactDays != null ? dayUnit(finished.durationFactDays) : "—";
    if (finished.durationDeltaDays != null) {
      termSub = t("estimate.finance.durationDeltaDays", {
        delta: `${finished.durationDeltaDays > 0 ? "+" : ""}${finished.durationDeltaDays}`,
      });
      termSubDestructive = finished.durationDeltaDays > 0;
    } else if (finished.durationFactDays == null) {
      // Only claim "no dates" when there really is no fact duration; a missing
      // baseline alone just leaves the delta sub out.
      termSub = t("estimate.finance.noDates");
    }
  } else {
    termValue = view.daysToEnd != null ? dayUnit(view.daysToEnd) : "—";
    if (view.behindScheduleDays > 0) {
      termSub = `${t("estimate.summary.behindSchedule")}: ${dayUnit(view.behindScheduleDays)}`;
      termSubDestructive = true;
    } else if (view.daysToEnd == null) {
      termSub = t("estimate.finance.noDates");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-3", showsExecution ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <KpiCard
          label={finished ? t("estimate.finance.finalRevenueExVat") : t("estimate.finance.revenueExVat")}
          value={formatCompactMoney(view.revenueExVatCents, currency)}
        />
        {finished ? (
          <KpiCard
            label={view.spendExcludesHr
              ? `${t("estimate.finance.finalCost")} (${t("projectData.financeSummary.withoutHr")})`
              : t("estimate.finance.finalCost")}
            value={formatCompactMoney(view.spentCents, currency)}
            sub={t("estimate.finance.finalCostPlan", { value: formatCompactMoney(view.costTotalCents, currency) })}
          />
        ) : (
          <KpiCard label={t("estimate.finance.costTotal")} value={formatCompactMoney(view.costTotalCents, currency)} />
        )}
        {finished ? (
          <KpiCard
            label={t("estimate.finance.finalMarginPct")}
            value={formatPct(finished.marginFactPct, 1)}
            sub={finished.marginDeltaPp != null
              ? t("estimate.finance.marginDeltaPp", {
                // Sign from the rounded value (signDisplay) so -0.04 renders "0", not "-0".
                delta: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(finished.marginDeltaPp),
              })
              : null}
            subClassName={finished.marginDeltaPp != null && Math.round(finished.marginDeltaPp * 10) / 10 < 0 ? "text-destructive" : undefined}
          />
        ) : (
          <KpiCard
            label={t("estimate.finance.marginPct")}
            value={formatPct(view.profitabilityPct, 1)}
            sub={`${t("estimate.finance.margin")}: ${formatCompactMoney(view.profitExVatCents, currency)}`}
          />
        )}
        {finished ? (
          <KpiCard
            label={t("estimate.finance.costAccuracy")}
            value={formatSignedPct(finished.costDeltaPct, 0)}
            valueClassName={finished.costDeltaPct != null && Math.round(finished.costDeltaPct) > 0 ? "text-destructive" : undefined}
          />
        ) : (
          showsExecution && (
            <KpiCard
              label={t("estimate.finance.completion")}
              value={formatPct(view.completion.pct, 0)}
              sub={t("estimate.finance.completionTasks", { done: view.completion.done, total: view.completion.total })}
            />
          )
        )}
        <KpiCard
          label={t("estimate.finance.term")}
          value={termValue}
          sub={termSub}
          subClassName={termSubDestructive ? "text-destructive" : undefined}
        />
      </div>

      {showsExecutionBar && (
        <div className="space-y-1.5">
          <Progress
            value={Math.min(100, Math.max(0, view.utilizationPct ?? 0))}
            className="h-2 bg-muted"
            indicatorClassName={overspend ? "bg-destructive" : "bg-foreground"}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[15px]">
            <p>
              <span className="text-muted-foreground">{t("estimate.summary.actualSpent")}: </span>
              <span className={cn("font-medium tabular-nums", overspend ? "text-destructive" : "text-foreground")}>
                {view.hasActualFinancialData ? formatCompactMoney(view.spentCents, currency) : "—"}
              </span>
              {view.hasActualFinancialData && view.spendExcludesHr && (
                <span className="ml-1 text-muted-foreground">({t("projectData.financeSummary.withoutHr")})</span>
              )}
              {view.hasActualFinancialData && view.utilizationPct != null && (
                <span className={cn("ml-1.5", overspend ? "text-destructive" : "text-muted-foreground")}>
                  · {t("estimate.finance.utilizationOfCost", { pct: Math.round(view.utilizationPct) })}
                </span>
              )}
            </p>
            {riskActive && (
              <p className="text-[13px] font-medium text-destructive">
                {view.completion.pct != null
                  ? t("estimate.finance.utilizationRisk", {
                    spent: Math.round(view.utilizationPct ?? 0),
                    done: Math.round(view.completion.pct),
                  })
                  : t("estimate.finance.utilizationRiskNoCompletion", {
                    spent: Math.round(view.utilizationPct ?? 0),
                  })}
              </p>
            )}
          </div>
        </div>
      )}

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className="rounded-lg border border-border/70">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/20"
            >
              <span className="inline-flex items-center gap-2 text-[15px] font-medium text-foreground">
                {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t("estimate.finance.details")}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border/60 px-3 py-3">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-1">
                {isContractorMode && (
                  <DetailRow label={t("estimate.breakdown.markup")} value={formatMoney(view.markupTotalCents, currency)} />
                )}
                <DetailRow label={t("estimate.breakdown.subtotalExVat")} value={formatMoney(view.subtotalBeforeDiscountCents, currency)} />
                <DetailRow label={t("estimate.breakdown.discount")} value={formatMoney(view.discountTotalCents, currency)} />
                <DetailRow label={t("estimate.breakdown.vatAmount")} value={formatMoney(view.taxAmountCents, currency)} />
                <DetailRow label={t("estimate.summary.totalIncVat")} value={formatMoney(view.totalIncVatCents, currency)} emphasized />
                <DetailRow label={t("estimate.summary.toBePaid")} value={formatMoney(view.toBePaidPlannedCents, currency)} />
                {showsExecutionBar && (
                  <>
                    <DetailRow
                      label={t("estimate.finance.eac")}
                      value={view.eac ? formatMoney(view.eac.eacCents, currency) : "—"}
                    />
                    <DetailRow
                      label={t("estimate.finance.eacOverrun")}
                      value={view.eac ? formatMoney(view.eac.overrunCents, currency) : "—"}
                      valueClassName={view.eac && view.eac.overrunCents > 0 ? "text-destructive" : undefined}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] gap-3 px-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <span>{t("estimate.costOverview.col.category")}</span>
                  <span className="text-right">{t("estimate.costOverview.col.planned")}</span>
                  <span className="text-right">
                    {view.spendExcludesHr
                      ? `${t("estimate.costOverview.col.actual")} (${t("projectData.financeSummary.withoutHr")})`
                      : t("estimate.costOverview.col.actual")}
                  </span>
                </div>
                {RESOURCE_TYPE_ORDER.map((type) => (
                  <div
                    key={type}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] items-center gap-3 rounded-md px-3 py-1.5 text-[15px]"
                  >
                    <span className="text-muted-foreground">{t(`estimate.resource.semantic.${type}`)}</span>
                    <span className="text-right tabular-nums text-foreground">{formatMoney(view.plannedCostByTypeCents[type], currency)}</span>
                    <span className="text-right tabular-nums text-foreground">
                      {view.hasActualFinancialData ? formatMoney(view.spentByTypeCents[type], currency) : "—"}
                    </span>
                  </div>
                ))}
                {view.hasActualFinancialData && view.unattributedSpendCents > 0 && (
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] items-center gap-3 rounded-md px-3 py-1.5 text-[15px]">
                    <span className="text-muted-foreground">{t("estimate.finance.unattributedSpend")}</span>
                    <span className="text-right tabular-nums text-muted-foreground">—</span>
                    <span className="text-right tabular-nums text-foreground">{formatMoney(view.unattributedSpendCents, currency)}</span>
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] items-center gap-3 rounded-md bg-muted/30 px-3 py-1.5 text-[15px]">
                  <span className="font-medium text-foreground">{t("estimate.costOverview.total")}</span>
                  <span className="text-right font-semibold tabular-nums text-foreground">{formatMoney(view.costTotalCents, currency)}</span>
                  <span className="text-right font-semibold tabular-nums text-foreground">
                    {view.hasActualFinancialData ? formatMoney(view.spentCents, currency) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
