// Portfolio "можно ли брать новый проект" verdict (spec Part 3 §7.5).
// A heuristic over the portfolio snapshot, not a hard rule. Thresholds live in
// src/lib/finance/thresholds.ts.

import { PORTFOLIO_MIN_MARGIN_PCT, PORTFOLIO_TARGET_MARGIN_PCT } from "@/lib/finance/thresholds";
import type { PortfolioFinanceSnapshot } from "@/lib/finance/portfolio-read-model";

export type PortfolioVerdict = "go" | "caution" | "no";

export interface PortfolioVerdictSignals {
  portfolioMarginPct: number | null;
  atRiskCount: number;
  backlogCents: number;
  overallProgressPct: number | null;
}

export interface PortfolioVerdictResult {
  verdict: PortfolioVerdict;
  signals: PortfolioVerdictSignals;
}

/**
 * Verdict from a portfolio margin and risk count:
 * - "no" when margin is below the minimum;
 * - "go" when margin clears the target AND nothing is at risk;
 * - "caution" otherwise (including an unknown margin).
 */
export function verdictFromSignals(marginPct: number | null, atRiskCount: number): PortfolioVerdict {
  if (marginPct == null) return "caution";
  if (marginPct < PORTFOLIO_MIN_MARGIN_PCT) return "no";
  if (marginPct >= PORTFOLIO_TARGET_MARGIN_PCT && atRiskCount === 0) return "go";
  return "caution";
}

export function computePortfolioVerdict(snapshot: PortfolioFinanceSnapshot): PortfolioVerdictResult {
  const signals: PortfolioVerdictSignals = {
    portfolioMarginPct: snapshot.totals.marginPct,
    atRiskCount: snapshot.totals.atRiskCount,
    backlogCents: snapshot.pipeline.inWork.backlogCents ?? 0,
    overallProgressPct: snapshot.totals.avgPercentComplete,
  };
  return { verdict: verdictFromSignals(signals.portfolioMarginPct, signals.atRiskCount), signals };
}
