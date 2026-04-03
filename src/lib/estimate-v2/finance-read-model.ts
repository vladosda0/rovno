import { getProject } from "@/data/store";
import { getEstimateV2ProjectState, type EstimateV2ProjectView } from "@/data/estimate-v2-store";
import {
  computeFactFromProcurementAndHR,
  computePlannedFromEstimateV2,
  type FactRollups,
} from "@/lib/estimate-v2/rollups";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import type { Project } from "@/types/entities";
import type {
  EstimateExecutionStatus,
} from "@/types/estimate-v2";

export interface EstimateV2FinanceProjectSummary {
  projectId: string;
  projectTitle: string;
  currency: string;
  hasEstimate: boolean;
  status: EstimateExecutionStatus | null;
  stageCount: number;
  workCount: number;
  lineCount: number;
  plannedBudgetCents: number;
  spentCents: number;
  toBePaidCents: number;
  varianceCents: number;
  percentSpent: number;
  /** Same semantics as ProjectEstimate: margin on pricing totals (taxable base vs cost); null when no revenue base. */
  percentProfitability: number | null;
}

export interface EstimateV2FinanceSnapshot {
  projects: EstimateV2FinanceProjectSummary[];
  totals: {
    plannedBudgetCents: number;
    spentCents: number;
    toBePaidCents: number;
    varianceCents: number;
  };
}

function hasEstimateContent(input: {
  lineCount: number;
  versionCount: number;
  status: EstimateExecutionStatus;
}): boolean {
  return input.lineCount > 0
    || input.versionCount > 0
    || input.status !== "planning";
}

function toProjectLike(
  project: Pick<Project, "id" | "title"> | null | undefined,
  fallbackTitle: string,
): Pick<Project, "id" | "title"> | null {
  if (!project) return null;
  return {
    id: project.id,
    title: project.title || fallbackTitle,
  };
}

/** Browser store + optional workspace project row (same resolution as finance summary). */
export function resolveEstimateV2FinanceProjectMeta(
  projectId: string,
  projectInput?: Pick<Project, "id" | "title"> | null,
): Pick<Project, "id" | "title"> | null {
  const storedProject = getProject(projectId);
  return toProjectLike(projectInput ?? storedProject ?? null, "Untitled project");
}

type EstimateV2FinanceStateSlice = Pick<
  EstimateV2ProjectView,
  "project" | "stages" | "works" | "lines" | "versions"
>;

/**
 * Pure summary from estimate-v2 state + fact rollups (same fact path as ProjectEstimate when inputs match).
 */
export function buildEstimateV2FinanceProjectSummary(
  projectId: string,
  projectTitle: string,
  state: EstimateV2FinanceStateSlice,
  fact: FactRollups,
): EstimateV2FinanceProjectSummary {
  const planned = computePlannedFromEstimateV2({
    project: state.project,
    stages: state.stages,
    lines: state.lines,
  });

  const hasEstimate = hasEstimateContent({
    lineCount: state.lines.length,
    versionCount: state.versions.length,
    status: state.project.estimateStatus,
  });
  const plannedBudgetCents = hasEstimate ? planned.plannedBudgetCents : 0;
  const spentCents = hasEstimate ? fact.spentCents : 0;
  const toBePaidCents = hasEstimate ? fact.toBePaidPlannedCents : 0;
  const varianceCents = plannedBudgetCents - spentCents;
  const percentSpent = plannedBudgetCents > 0
    ? Math.max(0, Math.min(100, Math.round((spentCents / plannedBudgetCents) * 100)))
    : 0;

  const pricingTotals = computeProjectTotals(
    state.project,
    state.stages,
    state.works,
    state.lines,
    state.project.regime,
  );
  const revenueExVatCents = pricingTotals.taxableBaseCents;
  const costExVatCents = pricingTotals.costTotalCents;
  const percentProfitability = revenueExVatCents > 0
    ? ((revenueExVatCents - costExVatCents) / revenueExVatCents) * 100
    : null;

  return {
    projectId,
    projectTitle,
    currency: state.project.currency,
    hasEstimate,
    status: hasEstimate ? state.project.estimateStatus : null,
    stageCount: hasEstimate ? state.stages.length : 0,
    workCount: hasEstimate ? state.works.length : 0,
    lineCount: hasEstimate ? state.lines.length : 0,
    plannedBudgetCents,
    spentCents,
    toBePaidCents,
    varianceCents,
    percentSpent,
    percentProfitability,
  };
}

export function getEstimateV2FinanceProjectSummary(
  projectId: string,
  projectInput?: Pick<Project, "id" | "title"> | null,
): EstimateV2FinanceProjectSummary | null {
  const project = resolveEstimateV2FinanceProjectMeta(projectId, projectInput);
  if (!project) return null;

  const state = getEstimateV2ProjectState(projectId);
  const fact = computeFactFromProcurementAndHR(projectId);
  return buildEstimateV2FinanceProjectSummary(project.id, project.title, state, fact);
}

export function getEstimateV2FinanceSnapshot(
  projects: Array<Pick<Project, "id" | "title">>,
): EstimateV2FinanceSnapshot {
  const summaries = projects
    .map((project) => getEstimateV2FinanceProjectSummary(project.id, project))
    .filter((summary): summary is EstimateV2FinanceProjectSummary => summary != null);

  return {
    projects: summaries,
    totals: {
      plannedBudgetCents: summaries.reduce((sum, summary) => sum + summary.plannedBudgetCents, 0),
      spentCents: summaries.reduce((sum, summary) => sum + summary.spentCents, 0),
      toBePaidCents: summaries.reduce((sum, summary) => sum + summary.toBePaidCents, 0),
      varianceCents: summaries.reduce((sum, summary) => sum + summary.varianceCents, 0),
    },
  };
}
