// Portfolio finance read-model (spec Part 3). Camel-case mirror of the
// get_portfolio_finance_snapshot RPC, plus a local builder that produces the
// SAME shape from the browser store for demo/local workspaces.
//
// The RPC already applies sensitive-detail redaction (money null + excluded
// from totals for non-detail projects). The local builder re-applies the same
// rule client-side via the Home sensitive-detail map.

import { THIN_MARGIN_PCT, UTILIZATION_RISK_GAP_PP } from "@/lib/finance/thresholds";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";

export type PortfolioProjectStatus = "planning" | "in_work" | "paused" | "finished";
export type PortfolioFinanceVisibility = "detail" | "summary" | "none";
export type PortfolioRiskFlag = "overspend" | "behind" | "thin_margin";

export interface PortfolioProjectRow {
  projectId: string;
  title: string;
  status: PortfolioProjectStatus;
  financeVisibility: PortfolioFinanceVisibility;
  hasEstimate: boolean;
  /** Monetary fields are null when the viewer lacks detail access for the project. */
  contractValueCents: number | null;
  costCents: number | null;
  marginCents: number | null;
  marginPct: number | null;
  spentCents: number | null;
  percentSpent: number | null;
  toBePaidCents: number | null;
  tasksDone: number;
  tasksTotal: number;
  percentComplete: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  scheduleBehindDays: number;
  riskFlags: PortfolioRiskFlag[];
}

export interface PortfolioTotals {
  contractValueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number | null;
  spentCents: number;
  toBePaidCents: number;
  activeCount: number;
  atRiskCount: number;
  avgPercentComplete: number | null;
  redactedProjectCount: number;
}

export interface PortfolioPipelineBucket {
  count: number;
  contractValueCents: number;
  /** Only present on the in_work bucket. */
  backlogCents?: number;
}

export interface PortfolioPipeline {
  planning: PortfolioPipelineBucket;
  inWork: PortfolioPipelineBucket;
  finished: PortfolioPipelineBucket;
}

export interface PortfolioFinanceSnapshot {
  projects: PortfolioProjectRow[];
  totals: PortfolioTotals;
  pipeline: PortfolioPipeline;
}

const RISK_FLAGS: readonly PortfolioRiskFlag[] = ["overspend", "behind", "thin_margin"];
const STATUSES: readonly PortfolioProjectStatus[] = ["planning", "in_work", "paused", "finished"];
const VISIBILITIES: readonly PortfolioFinanceVisibility[] = ["detail", "summary", "none"];

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseRiskFlags(value: unknown): PortfolioRiskFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((flag): flag is PortfolioRiskFlag => RISK_FLAGS.includes(flag as PortfolioRiskFlag));
}

function parseRow(raw: Record<string, unknown>): PortfolioProjectRow {
  return {
    projectId: str(raw.project_id),
    title: str(raw.title),
    status: oneOf(raw.status, STATUSES, "planning"),
    financeVisibility: oneOf(raw.finance_visibility, VISIBILITIES, "none"),
    hasEstimate: raw.has_estimate === true,
    contractValueCents: numOrNull(raw.contract_value_cents),
    costCents: numOrNull(raw.cost_cents),
    marginCents: numOrNull(raw.margin_cents),
    marginPct: numOrNull(raw.margin_pct),
    spentCents: numOrNull(raw.spent_cents),
    percentSpent: numOrNull(raw.percent_spent),
    toBePaidCents: numOrNull(raw.to_be_paid_cents),
    tasksDone: num(raw.tasks_done),
    tasksTotal: num(raw.tasks_total),
    percentComplete: numOrNull(raw.percent_complete),
    plannedStart: strOrNull(raw.planned_start),
    plannedEnd: strOrNull(raw.planned_end),
    scheduleBehindDays: num(raw.schedule_behind_days),
    riskFlags: parseRiskFlags(raw.risk_flags),
  };
}

function parseBucket(raw: unknown): PortfolioPipelineBucket {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const bucket: PortfolioPipelineBucket = {
    count: num(obj.count),
    contractValueCents: num(obj.contract_value_cents),
  };
  if (obj.backlog_cents !== undefined) bucket.backlogCents = num(obj.backlog_cents);
  return bucket;
}

/** Parse the RPC jsonb payload into the camel-case snapshot. Tolerant of nulls/missing keys. */
export function mapPortfolioSnapshotFromRpc(payload: unknown): PortfolioFinanceSnapshot {
  const root = (payload ?? {}) as Record<string, unknown>;
  const projectsRaw = Array.isArray(root.projects) ? root.projects : [];
  const totals = (root.totals ?? {}) as Record<string, unknown>;
  const pipeline = (root.pipeline ?? {}) as Record<string, unknown>;

  return {
    projects: projectsRaw.map((row) => parseRow((row ?? {}) as Record<string, unknown>)),
    totals: {
      contractValueCents: num(totals.contract_value_cents),
      costCents: num(totals.cost_cents),
      marginCents: num(totals.margin_cents),
      marginPct: numOrNull(totals.margin_pct),
      spentCents: num(totals.spent_cents),
      toBePaidCents: num(totals.to_be_paid_cents),
      activeCount: num(totals.active_count),
      atRiskCount: num(totals.at_risk_count),
      avgPercentComplete: numOrNull(totals.avg_percent_complete),
      redactedProjectCount: num(totals.redacted_project_count),
    },
    pipeline: {
      planning: parseBucket(pipeline.planning),
      inWork: parseBucket(pipeline.in_work),
      finished: parseBucket(pipeline.finished),
    },
  };
}

/**
 * Client mirror of the SQL risk-flag expressions (thresholds.ts). Used by the local
 * builder; the RPC computes its own server-side. Operates on detail-visible rows only —
 * a redacted row has null money and gets no flags.
 */
export function computeRiskFlags(row: {
  spentCents: number | null;
  costCents: number | null;
  percentSpent: number | null;
  percentComplete: number | null;
  marginPct: number | null;
  scheduleBehindDays: number;
}): PortfolioRiskFlag[] {
  const flags: PortfolioRiskFlag[] = [];
  const spent = row.spentCents ?? 0;
  const cost = row.costCents ?? 0;
  const overspendByAmount = spent > cost && spent > 0;
  const overspendByPace = row.percentSpent != null && row.percentComplete != null
    && row.percentSpent - row.percentComplete >= UTILIZATION_RISK_GAP_PP;
  if (overspendByAmount || overspendByPace) flags.push("overspend");
  if (row.scheduleBehindDays > 0) flags.push("behind");
  if (row.marginPct != null && row.marginPct < THIN_MARGIN_PCT) flags.push("thin_margin");
  return flags;
}

const EMPTY_TOTALS: PortfolioTotals = {
  contractValueCents: 0,
  costCents: 0,
  marginCents: 0,
  marginPct: null,
  spentCents: 0,
  toBePaidCents: 0,
  activeCount: 0,
  atRiskCount: 0,
  avgPercentComplete: null,
  redactedProjectCount: 0,
};

export const EMPTY_PORTFOLIO_SNAPSHOT: PortfolioFinanceSnapshot = {
  projects: [],
  totals: EMPTY_TOTALS,
  pipeline: {
    planning: { count: 0, contractValueCents: 0 },
    inWork: { count: 0, contractValueCents: 0, backlogCents: 0 },
    finished: { count: 0, contractValueCents: 0 },
  },
};

/**
 * Build the same snapshot shape from browser-store project summaries (demo/local mode).
 * `canViewDetail` gates each project the way effective_finance_visibility does server-side:
 * detail → money + flags; otherwise money null, flags empty, counted only as redacted.
 */
export function buildLocalPortfolioSnapshot(
  summaries: EstimateV2FinanceProjectSummary[],
  canViewDetail: (projectId: string) => boolean,
): PortfolioFinanceSnapshot {
  const rows: PortfolioProjectRow[] = summaries.map((summary) => {
    const detail = canViewDetail(summary.projectId);
    const status: PortfolioProjectStatus = summary.status ?? "planning";
    if (!detail) {
      return {
        projectId: summary.projectId,
        title: summary.projectTitle,
        status,
        financeVisibility: "none",
        hasEstimate: summary.hasEstimate,
        contractValueCents: null,
        costCents: null,
        marginCents: null,
        marginPct: null,
        spentCents: null,
        percentSpent: null,
        toBePaidCents: null,
        tasksDone: summary.tasksDone,
        tasksTotal: summary.tasksTotal,
        percentComplete: summary.percentComplete,
        plannedStart: null,
        plannedEnd: null,
        scheduleBehindDays: summary.behindScheduleDays,
        riskFlags: [],
      };
    }
    const marginPct = summary.contractValueCents > 0
      ? (summary.marginCents / summary.contractValueCents) * 100
      : null;
    const percentSpent = summary.percentUtilization;
    return {
      projectId: summary.projectId,
      title: summary.projectTitle,
      status,
      financeVisibility: "detail",
      hasEstimate: summary.hasEstimate,
      contractValueCents: summary.contractValueCents,
      costCents: summary.costCents,
      marginCents: summary.marginCents,
      marginPct,
      spentCents: summary.spentCents,
      percentSpent,
      toBePaidCents: summary.toBePaidCents,
      tasksDone: summary.tasksDone,
      tasksTotal: summary.tasksTotal,
      percentComplete: summary.percentComplete,
      plannedStart: null,
      plannedEnd: null,
      scheduleBehindDays: summary.behindScheduleDays,
      riskFlags: computeRiskFlags({
        spentCents: summary.spentCents,
        costCents: summary.costCents,
        percentSpent,
        percentComplete: summary.percentComplete,
        marginPct,
        scheduleBehindDays: summary.behindScheduleDays,
      }),
    };
  });

  return { projects: rows, totals: aggregateTotals(rows), pipeline: aggregatePipeline(rows) };
}

function isDetail(row: PortfolioProjectRow): boolean {
  return row.financeVisibility === "detail";
}

function aggregateTotals(rows: PortfolioProjectRow[]): PortfolioTotals {
  const detailRows = rows.filter(isDetail);
  const contract = detailRows.reduce((sum, r) => sum + (r.contractValueCents ?? 0), 0);
  const margin = detailRows.reduce((sum, r) => sum + (r.marginCents ?? 0), 0);
  const completePcts = detailRows
    .map((r) => r.percentComplete)
    .filter((p): p is number => p != null);
  return {
    contractValueCents: contract,
    costCents: detailRows.reduce((sum, r) => sum + (r.costCents ?? 0), 0),
    marginCents: margin,
    marginPct: contract > 0 ? (margin / contract) * 100 : null,
    spentCents: detailRows.reduce((sum, r) => sum + (r.spentCents ?? 0), 0),
    toBePaidCents: detailRows.reduce((sum, r) => sum + (r.toBePaidCents ?? 0), 0),
    activeCount: rows.filter((r) => r.status !== "finished").length,
    atRiskCount: detailRows.filter((r) => r.riskFlags.length > 0).length,
    avgPercentComplete: completePcts.length > 0
      ? completePcts.reduce((sum, p) => sum + p, 0) / completePcts.length
      : null,
    redactedProjectCount: rows.filter((r) => !isDetail(r)).length,
  };
}

function bucketFor(rows: PortfolioProjectRow[], withBacklog: boolean): PortfolioPipelineBucket {
  const detailRows = rows.filter(isDetail);
  const bucket: PortfolioPipelineBucket = {
    count: rows.length,
    contractValueCents: detailRows.reduce((sum, r) => sum + (r.contractValueCents ?? 0), 0),
  };
  if (withBacklog) {
    bucket.backlogCents = detailRows.reduce(
      (sum, r) => sum + Math.round((r.contractValueCents ?? 0) * (1 - (r.percentComplete ?? 0) / 100)),
      0,
    );
  }
  return bucket;
}

function aggregatePipeline(rows: PortfolioProjectRow[]): PortfolioPipeline {
  return {
    planning: bucketFor(rows.filter((r) => r.status === "planning"), false),
    // paused is bucketed with in_work, matching the RPC.
    inWork: bucketFor(rows.filter((r) => r.status === "in_work" || r.status === "paused"), true),
    finished: bucketFor(rows.filter((r) => r.status === "finished"), false),
  };
}
