// "Влезет ли новый проект" what-if calculator (spec Part 3 §7.6).
// A pure client-side projection over the current portfolio snapshot — no DB writes.

import type { PortfolioFinanceSnapshot } from "@/lib/finance/portfolio-read-model";
import { verdictFromSignals, type PortfolioVerdict } from "@/lib/finance/portfolio-verdict";
import { THIN_MARGIN_PCT } from "@/lib/finance/thresholds";

export interface NewProjectFitInput {
  /** New project contract value (ex VAT), cents. */
  contractCents: number;
  /** Expected cost (себестоимость), cents. Provide this OR marginPct. */
  costCents?: number | null;
  /** Expected margin %, used to derive cost when costCents is absent. */
  marginPct?: number | null;
  /** Planned start (ISO date); optional, drives the schedule-overlap signal. */
  startDate?: string | null;
  /** Planned duration in days; optional, drives the schedule-overlap signal. */
  durationDays?: number | null;
}

export interface NewProjectFitResult {
  /** Cost used for the projection (provided, or derived from margin %). */
  newCostCents: number;
  /** contract − cost for the new project. */
  newMarginCents: number;
  /** Σ portfolio margin including the new project. */
  newPortfolioMarginCents: number;
  /** New portfolio margin %; null when the combined contract is 0. */
  newPortfolioMarginPct: number | null;
  /** Backlog added by the new project (its whole contract is unstarted at the start). */
  addedBacklogCents: number;
  /** Active (in_work/paused) projects whose dates overlap the new window; count fallback when dates missing. */
  overlappingActiveCount: number;
  /** True when overlap was computed from real dates rather than the active-count fallback. */
  overlapFromDates: boolean;
  verdict: PortfolioVerdict;
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function computeOverlap(
  snapshot: PortfolioFinanceSnapshot,
  startDate: string | null | undefined,
  durationDays: number | null | undefined,
): { count: number; fromDates: boolean } {
  const active = snapshot.projects.filter((p) => p.status === "in_work" || p.status === "paused");
  const start = toTime(startDate);
  const duration = durationDays != null && durationDays > 0 ? durationDays : null;

  // Fallback: without a usable new-project window, report the count of concurrent active projects.
  if (start == null || duration == null) {
    return { count: active.length, fromDates: false };
  }
  const end = start + duration * DAY_MS;

  let count = 0;
  let anyDated = false;
  active.forEach((p) => {
    const ps = toTime(p.plannedStart);
    const pe = toTime(p.plannedEnd);
    if (ps == null || pe == null) return;
    anyDated = true;
    // Intersection of [start, end] and [ps, pe].
    if (ps <= end && pe >= start) count += 1;
  });

  // If no active project has dates, the date-based overlap is meaningless — fall back.
  if (!anyDated) return { count: active.length, fromDates: false };
  return { count, fromDates: true };
}

export function computeNewProjectFit(
  snapshot: PortfolioFinanceSnapshot,
  input: NewProjectFitInput,
): NewProjectFitResult {
  const contract = Math.max(0, Math.round(input.contractCents));
  const newCostCents = input.costCents != null
    ? Math.max(0, Math.round(input.costCents))
    : input.marginPct != null
      ? Math.max(0, Math.round(contract * (1 - input.marginPct / 100)))
      : 0;
  const newMarginCents = contract - newCostCents;

  const combinedContract = snapshot.totals.contractValueCents + contract;
  const newPortfolioMarginCents = snapshot.totals.marginCents + newMarginCents;
  const newPortfolioMarginPct = combinedContract > 0
    ? (newPortfolioMarginCents / combinedContract) * 100
    : null;

  const overlap = computeOverlap(snapshot, input.startDate, input.durationDays);

  // The new project itself counts toward the at-risk gate when its margin is thin/negative,
  // so a loss-making addition cannot return "go" just because the blended margin still clears
  // the target.
  const newProjectMarginPct = contract > 0 ? (newMarginCents / contract) * 100 : null;
  const newProjectAtRisk = newMarginCents < 0
    || (newProjectMarginPct != null && newProjectMarginPct < THIN_MARGIN_PCT);
  const projectedAtRiskCount = snapshot.totals.atRiskCount + (newProjectAtRisk ? 1 : 0);

  return {
    newCostCents,
    newMarginCents,
    newPortfolioMarginCents,
    newPortfolioMarginPct,
    addedBacklogCents: contract,
    overlappingActiveCount: overlap.count,
    overlapFromDates: overlap.fromDates,
    // Same threshold heuristic as the standing verdict, on the projected portfolio margin
    // and a risk count that includes the new project.
    verdict: verdictFromSignals(newPortfolioMarginPct, projectedAtRiskCount),
  };
}
