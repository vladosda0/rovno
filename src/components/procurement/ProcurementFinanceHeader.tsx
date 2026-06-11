import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { DetailRow, KpiCard } from "@/components/finance/FinancePrimitives";
import { formatPct } from "@/lib/finance/format";
import { formatCompactMoney, formatMoney } from "@/lib/estimate-v2/format-money";

export interface ProcurementPpvLineView {
  procurementItemId: string;
  name: string;
  deltaCents: number;
}

export interface ProcurementPpvView {
  deltaCents: number;
  /** delta / base × 100; null when nothing received with known prices. */
  pct: number | null;
  lines: ProcurementPpvLineView[];
}

export interface ProcurementInStockLocationView {
  locationId: string;
  locationName: string;
  totalValueCents: number;
  itemCount: number;
}

/**
 * Pre-computed view-model for the procurement finance header. All money in cents;
 * the page converts once from the fulfillment lib's major units.
 */
export interface ProcurementFinanceView {
  /** Single budget basis: material + tool cost from the estimate (себестоимость). */
  budgetCents: number;
  /** Received value on applied supplier orders; null when order prices are missing. */
  receivedCents: number | null;
  /** Open (ordered, not yet received) value; null when order prices are missing. */
  inTransitCents: number | null;
  /** received + inTransit; null when either side is unknown. */
  usedCents: number | null;
  /** budget − used; null when used is unknown. */
  remainingBudgetCents: number | null;
  /** Σ planned price × remaining-to-order qty (requested tab total). */
  toOrderCents: number;
  /** Current warehouse value (in-stock tab total). */
  inStockValueCents: number;
  hasLinkedItems: boolean;
  missingPlannedPriceCount: number;
  missingOrderPriceCount: number;
  ppv: ProcurementPpvView | null;
  inStockByLocation: ProcurementInStockLocationView[];
  lastReceivedAt: string | null;
}

interface ProcurementFinanceHeaderProps {
  view: ProcurementFinanceView;
  currency: string;
}

/** Overpay below this percent of the received base is noise, not an insight (spec §7.5 benchmark). */
const PPV_OVERPAY_NOTICE_PCT = 1;
/** "Almost everything is in transit" once received is below this share of the used total. */
const IN_TRANSIT_DOMINANCE_SHARE = 0.2;
/** Price-drift note once «осталось заказать» differs from the bar remainder by this share of budget. */
const PRICE_DRIFT_NOTICE_SHARE = 0.01;

function pctOfBudget(valueCents: number | null, budgetCents: number): number | null {
  if (valueCents === null || budgetCents <= 0) return null;
  return (valueCents / budgetCents) * 100;
}

export function ProcurementFinanceHeader({ view, currency }: ProcurementFinanceHeaderProps) {
  const { t, i18n } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lastDeliveryFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short", year: "numeric" }),
    [i18n.language],
  );

  const money = (cents: number) => formatCompactMoney(cents, currency);
  const moneyOrDash = (cents: number | null) => (cents === null ? "—" : money(cents));

  // Empty pipeline: no linked items yet → the whole budget is still to order.
  const toOrderDisplayCents = view.hasLinkedItems ? view.toOrderCents : view.budgetCents;

  const overspendCents = view.usedCents !== null && view.budgetCents > 0
    ? view.usedCents - view.budgetCents
    : null;
  const overspend = overspendCents !== null && overspendCents > 0;

  // Funnel segments as % of budget; received fills first, in-transit truncates at 100%.
  const receivedSegmentPct = view.budgetCents > 0
    ? Math.min(Math.max(((view.receivedCents ?? 0) / view.budgetCents) * 100, 0), 100)
    : 0;
  const inTransitSegmentPct = view.budgetCents > 0
    ? Math.min(Math.max(((view.inTransitCents ?? 0) / view.budgetCents) * 100, 0), 100 - receivedSegmentPct)
    : 0;

  // Single insight line, highest-priority signal wins. A null pct with a positive delta
  // means overpay against a zero planned base — still a real overpay, never noise.
  const ppvOverpayActive = Boolean(
    view.ppv && view.ppv.deltaCents > 0 && (view.ppv.pct === null || view.ppv.pct >= PPV_OVERPAY_NOTICE_PCT),
  );
  const inTransitDominant = view.usedCents !== null
    && view.usedCents > 0
    && (view.inTransitCents ?? 0) > 0
    && (view.receivedCents ?? 0) < view.usedCents * IN_TRANSIT_DOMINANCE_SHARE;
  const barRemainderCents = view.usedCents !== null ? Math.max(view.budgetCents - view.usedCents, 0) : null;
  const priceDrift = view.hasLinkedItems
    && barRemainderCents !== null
    && view.budgetCents > 0
    && Math.abs(view.toOrderCents - barRemainderCents) > view.budgetCents * PRICE_DRIFT_NOTICE_SHARE;

  let insight: { text: string; destructive: boolean } | null = null;
  if (overspend && overspendCents !== null) {
    insight = { text: t("procurement.finance.insight.overspend", { value: money(overspendCents) }), destructive: true };
  } else if (ppvOverpayActive && view.ppv) {
    insight = {
      text: view.ppv.pct !== null
        ? t("procurement.finance.insight.ppvOverpay", {
          value: money(view.ppv.deltaCents),
          pct: formatPct(view.ppv.pct, 1),
        })
        : t("procurement.finance.insight.ppvOverpayNoPct", { value: money(view.ppv.deltaCents) }),
      destructive: true,
    };
  } else if (inTransitDominant && view.usedCents !== null) {
    insight = {
      text: t("procurement.finance.insight.inTransit", {
        used: money(view.usedCents),
        received: moneyOrDash(view.receivedCents),
      }),
      destructive: false,
    };
  } else if (priceDrift && barRemainderCents !== null) {
    insight = {
      text: t("procurement.finance.insight.priceDrift", {
        toOrder: money(view.toOrderCents),
        remaining: money(barRemainderCents),
      }),
      destructive: false,
    };
  }

  const dataHint = !view.hasLinkedItems
    ? t("procurement.finance.emptyAllToOrder")
    : view.missingPlannedPriceCount > 0
      ? t("procurement.hint.missingPlannedPrice", { count: view.missingPlannedPriceCount })
      : view.missingOrderPriceCount > 0
        ? t("procurement.hint.missingOrderPrice", { count: view.missingOrderPriceCount })
        : null;

  const legend: Array<{ key: string; label: string; value: string; pct: number | null; dotClassName: string }> = [
    {
      key: "received",
      label: t("procurement.finance.received"),
      value: moneyOrDash(view.receivedCents),
      pct: pctOfBudget(view.receivedCents, view.budgetCents),
      dotClassName: "bg-foreground",
    },
    {
      key: "inTransit",
      label: t("procurement.finance.inTransit"),
      value: moneyOrDash(view.inTransitCents),
      pct: pctOfBudget(view.inTransitCents, view.budgetCents),
      dotClassName: "bg-muted-foreground/40",
    },
    {
      key: "toOrder",
      label: t("procurement.finance.toOrder"),
      value: money(toOrderDisplayCents),
      pct: pctOfBudget(toOrderDisplayCents, view.budgetCents),
      dotClassName: "border border-border bg-transparent",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <KpiCard label={t("procurement.finance.budget")} value={money(view.budgetCents)} />
        <KpiCard
          label={t("procurement.finance.remaining")}
          value={moneyOrDash(view.remainingBudgetCents)}
          valueClassName={view.remainingBudgetCents !== null && view.remainingBudgetCents < 0 ? "text-destructive" : undefined}
        />
        <KpiCard label={t("procurement.finance.inStock")} value={money(view.inStockValueCents)} />
      </div>

      <div className="space-y-1.5">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full border border-border/60 bg-muted"
          role="img"
          aria-label={t("procurement.finance.funnelLabel")}
        >
          {receivedSegmentPct > 0 && (
            <div className="h-full bg-foreground" style={{ width: `${receivedSegmentPct}%` }} />
          )}
          {inTransitSegmentPct > 0 && (
            <div className="h-full bg-muted-foreground/40" style={{ width: `${inTransitSegmentPct}%` }} />
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          {legend.map((entry) => (
            <span key={entry.key} className="inline-flex items-baseline gap-1.5">
              <span className={cn("inline-block h-2 w-2 shrink-0 self-center rounded-full", entry.dotClassName)} />
              <span className="text-muted-foreground">{entry.label}:</span>
              <span className="font-medium tabular-nums text-foreground">{entry.value}</span>
              {entry.pct !== null && (
                <span className="text-[11px] text-muted-foreground">· {formatPct(entry.pct, 0)}</span>
              )}
            </span>
          ))}
        </div>
        {insight && (
          <p className={cn("text-[11px] font-medium", insight.destructive ? "text-destructive" : "text-muted-foreground")}>
            {insight.text}
          </p>
        )}
        {dataHint && <p className="text-[11px] text-muted-foreground">{dataHint}</p>}
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className="rounded-lg border border-border/70">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/20"
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t("procurement.finance.details")}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border/60 px-3 py-3">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-1">
                <DetailRow label={t("procurement.finance.budget")} value={formatMoney(view.budgetCents, currency)} />
                <DetailRow label={t("procurement.finance.received")} value={view.receivedCents === null ? "—" : formatMoney(view.receivedCents, currency)} />
                <DetailRow label={t("procurement.finance.inTransit")} value={view.inTransitCents === null ? "—" : formatMoney(view.inTransitCents, currency)} />
                <DetailRow
                  label={t("procurement.finance.used")}
                  value={view.usedCents === null ? "—" : formatMoney(view.usedCents, currency)}
                  emphasized
                />
                <DetailRow
                  label={t("procurement.finance.remaining")}
                  value={view.remainingBudgetCents === null ? "—" : formatMoney(view.remainingBudgetCents, currency)}
                  valueClassName={view.remainingBudgetCents !== null && view.remainingBudgetCents < 0 ? "text-destructive" : undefined}
                />
                <DetailRow label={t("procurement.finance.toOrder")} value={formatMoney(toOrderDisplayCents, currency)} />
                <DetailRow label={t("procurement.finance.inStock")} value={formatMoney(view.inStockValueCents, currency)} />
                {view.lastReceivedAt && (
                  <DetailRow
                    label={t("procurement.finance.lastDelivery")}
                    value={lastDeliveryFormatter.format(new Date(view.lastReceivedAt))}
                  />
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t("procurement.finance.ppv.title")}
                  </p>
                  {view.ppv && (view.ppv.pct !== null || view.ppv.deltaCents !== 0 || view.ppv.lines.length > 0) ? (
                    <>
                      <DetailRow
                        label={view.ppv.deltaCents > 0
                          ? t("procurement.finance.ppv.overpay")
                          : view.ppv.deltaCents < 0
                            ? t("procurement.finance.ppv.savings")
                            : t("procurement.finance.ppv.onPlan")}
                        value={`${formatMoney(Math.abs(view.ppv.deltaCents), currency)} · ${view.ppv.pct === null ? "—" : formatPct(Math.abs(view.ppv.pct), 1)}`}
                        valueClassName={view.ppv.deltaCents > 0 ? "text-destructive" : undefined}
                        emphasized
                      />
                      {view.ppv.lines.map((line) => (
                        <DetailRow
                          key={line.procurementItemId}
                          label={line.name}
                          value={formatMoney(line.deltaCents, currency)}
                          valueClassName={line.deltaCents > 0 ? "text-destructive" : undefined}
                        />
                      ))}
                    </>
                  ) : (
                    <p className="px-3 text-[13px] text-muted-foreground">{t("procurement.finance.ppv.none")}</p>
                  )}
                </div>

                {view.inStockByLocation.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {t("procurement.finance.byLocation")}
                    </p>
                    {view.inStockByLocation.map((location) => (
                      <DetailRow
                        key={location.locationId}
                        label={`${location.locationName} · ${t("procurement.finance.byLocationItems", { count: location.itemCount })}`}
                        value={formatMoney(location.totalValueCents, currency)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
