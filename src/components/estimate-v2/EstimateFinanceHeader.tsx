import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCompactMoney, formatMoney } from "@/lib/estimate-v2/format-money";
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

// Accent the risk line / overspend once utilization runs this many percentage points
// ahead of completion (or once it exceeds 100% of cost). Tunable.
const UTILIZATION_RISK_GAP_PP = 20;

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
  // Summary-mode plumbing
  operationalUpperBlock: EstimateOperationalUpperBlock | null;
  rpcSummaryTotalIncVatCents: number | null;
  uiTotalIncVatCents: number;
  taxBps: number;
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

function formatPct(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value)}%`;
}

function bpsToPct(bps: number): string {
  return (bps / 100).toString();
}

function KpiCard({
  label,
  value,
  valueClassName,
  sub,
  subClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string | null;
  subClassName?: string;
}) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-medium tabular-nums text-foreground", valueClassName)}>{value}</p>
      {sub ? <p className={cn("text-[11px] text-muted-foreground", subClassName)}>{sub}</p> : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-[13px]",
        emphasized && "bg-muted/30",
      )}
    >
      <span className={emphasized ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums text-foreground", emphasized ? "font-semibold" : "font-medium")}>{value}</span>
    </div>
  );
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
        <p className="text-[13px] text-muted-foreground">{t("estimate.planning.financeHidden")}</p>
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
              <p className="text-[13px] text-muted-foreground">{t("estimate.summary.byResourceTypeClient")}</p>
              <div className="mt-1 space-y-1">
                {Object.entries(clientBreakdown).map(([key, cents]) => (
                  <div key={key} className="flex items-center justify-between text-[13px]">
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
        <KpiCard label={t("estimate.finance.revenueExVat")} value={formatCompactMoney(view.revenueExVatCents, currency)} />
        <KpiCard label={t("estimate.finance.costTotal")} value={formatCompactMoney(view.costTotalCents, currency)} />
        <KpiCard
          label={t("estimate.finance.marginPct")}
          value={formatPct(view.profitabilityPct, 1)}
          sub={`${t("estimate.finance.margin")}: ${formatCompactMoney(view.profitExVatCents, currency)}`}
        />
        {showsExecution && (
          <KpiCard
            label={t("estimate.finance.completion")}
            value={formatPct(view.completion.pct, 0)}
            sub={t("estimate.finance.completionTasks", { done: view.completion.done, total: view.completion.total })}
          />
        )}
        <KpiCard
          label={t("estimate.finance.term")}
          value={termValue}
          sub={termSub}
          subClassName={termSubDestructive ? "text-destructive" : undefined}
        />
      </div>

      {showsExecution && (
        <div className="space-y-1.5">
          <Progress
            value={Math.min(100, Math.max(0, view.utilizationPct ?? 0))}
            className="h-2 bg-muted"
            indicatorClassName={overspend ? "bg-destructive" : "bg-foreground"}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
            <p>
              <span className="text-muted-foreground">{t("estimate.summary.actualSpent")}: </span>
              <span className={cn("font-medium tabular-nums", overspend ? "text-destructive" : "text-foreground")}>
                {view.hasActualFinancialData ? formatCompactMoney(view.spentCents, currency) : "—"}
              </span>
              {view.hasActualFinancialData && view.utilizationPct != null && (
                <span className={cn("ml-1.5", overspend ? "text-destructive" : "text-muted-foreground")}>
                  · {t("estimate.finance.utilizationOfCost", { pct: Math.round(view.utilizationPct) })}
                </span>
              )}
            </p>
            {riskActive && (
              <p className="text-[11px] font-medium text-destructive">
                {t("estimate.finance.utilizationRisk", {
                  spent: Math.round(view.utilizationPct ?? 0),
                  done: Math.round(view.completion.pct ?? 0),
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
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
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
              </div>

              <div className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] gap-3 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <span>{t("estimate.costOverview.col.category")}</span>
                  <span className="text-right">{t("estimate.costOverview.col.planned")}</span>
                  <span className="text-right">{t("estimate.costOverview.col.actual")}</span>
                </div>
                {RESOURCE_TYPE_ORDER.map((type) => (
                  <div
                    key={type}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] items-center gap-3 rounded-md px-3 py-1.5 text-[13px]"
                  >
                    <span className="text-muted-foreground">{t(`estimate.resource.semantic.${type}`)}</span>
                    <span className="text-right tabular-nums text-foreground">{formatMoney(view.plannedCostByTypeCents[type], currency)}</span>
                    <span className="text-right tabular-nums text-foreground">
                      {view.hasActualFinancialData ? formatMoney(view.spentByTypeCents[type], currency) : "—"}
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)_minmax(92px,auto)] items-center gap-3 rounded-md bg-muted/30 px-3 py-1.5 text-[13px]">
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
