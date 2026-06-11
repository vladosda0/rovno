// Product-tunable thresholds shared by all finance blocks.
//
// NOTE: the portfolio rollup RPC (rovno-db: get_portfolio_finance_snapshot) duplicates
// these values in SQL risk-flag expressions. If you change a value here, change it there.

/** Risk line / overspend flag: utilization runs this many percentage points ahead of completion. */
export const UTILIZATION_RISK_GAP_PP = 20;

/** "Тонкая маржа" risk flag: project margin below this percent. */
export const THIN_MARGIN_PCT = 10;

/** Portfolio verdict "скорее да": portfolio margin at or above this percent (and no risky projects). */
export const PORTFOLIO_TARGET_MARGIN_PCT = 15;

/** Portfolio verdict "нет": portfolio margin below this percent. */
export const PORTFOLIO_MIN_MARGIN_PCT = 8;
