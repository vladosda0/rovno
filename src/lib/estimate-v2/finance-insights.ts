// Pure derived-finance helpers for the estimate header (spec sections 8.6 / 8.9).
// All money in cents; percentages 0..100.

/** EAC is hidden below this completion percentage: early-stage CPI explodes (spec 8.6 guard). */
export const EAC_MIN_COMPLETION_PCT = 20;

export interface EacForecast {
  /** Estimate at completion: costTotal / CPI. */
  eacCents: number;
  /** Forecast overrun vs planned cost; negative means projected savings. */
  overrunCents: number;
  /** Cost performance index: earned cost / actual spend. */
  cpi: number;
}

export function computeEac(input: {
  costTotalCents: number;
  spentCents: number;
  completionPct: number | null;
}): EacForecast | null {
  const { costTotalCents, spentCents, completionPct } = input;
  if (
    completionPct == null
    || !Number.isFinite(completionPct)
    || completionPct < EAC_MIN_COMPLETION_PCT
    || spentCents <= 0
    || costTotalCents <= 0
  ) {
    return null;
  }

  const earnedCostCents = costTotalCents * (completionPct / 100);
  const cpi = earnedCostCents / spentCents;
  if (!Number.isFinite(cpi) || cpi <= 0) return null;
  const eacCents = Math.round(costTotalCents / cpi);
  return {
    eacCents,
    overrunCents: eacCents - costTotalCents,
    cpi,
  };
}

export interface FinishedAccuracy {
  /** (spent − cost) / cost, %; positive = факт дороже сметы. Null when no planned cost. */
  costDeltaPct: number | null;
  /** Fact margin: (revenue − spent) / revenue, %. Null when no revenue. */
  marginFactPct: number | null;
  /** Fact margin minus planned margin, percentage points. Null when either side unknown. */
  marginDeltaPp: number | null;
  /** Fact duration in days (current works range). Null when dates missing. */
  durationFactDays: number | null;
  /** Fact duration minus planned duration, days; positive = дольше плана. Null when either missing. */
  durationDeltaDays: number | null;
}

export function computeFinishedAccuracy(input: {
  costTotalCents: number;
  spentCents: number;
  revenueExVatCents: number;
  plannedMarginPct: number | null;
  durationPlannedDays: number | null;
  durationEstimatedDays: number | null;
}): FinishedAccuracy {
  const costDeltaPct = input.costTotalCents > 0
    ? ((input.spentCents - input.costTotalCents) / input.costTotalCents) * 100
    : null;
  const marginFactPct = input.revenueExVatCents > 0
    ? ((input.revenueExVatCents - input.spentCents) / input.revenueExVatCents) * 100
    : null;
  const marginDeltaPp = marginFactPct != null && input.plannedMarginPct != null
    ? marginFactPct - input.plannedMarginPct
    : null;
  const durationDeltaDays = input.durationEstimatedDays != null && input.durationPlannedDays != null
    ? input.durationEstimatedDays - input.durationPlannedDays
    : null;

  return {
    costDeltaPct,
    marginFactPct,
    marginDeltaPp,
    durationFactDays: input.durationEstimatedDays,
    durationDeltaDays,
  };
}
