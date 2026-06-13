import { getProject, getTasks } from "@/data/store";
import { getEstimateV2ProjectState, type EstimateV2ProjectView } from "@/data/estimate-v2-store";
import {
  computeFactFromProcurementAndHR,
  computePlannedFromEstimateV2,
  type FactRollups,
} from "@/lib/estimate-v2/rollups";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import { toDayIndex } from "@/lib/estimate-v2/schedule";
import type { Project, Task } from "@/types/entities";
import type {
  EstimateExecutionStatus,
  EstimateV2Work,
  ScheduleBaseline,
} from "@/types/estimate-v2";

export type EstimateV2FinanceTaskSlice = Pick<Task, "id" | "status">;

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
  /** Revenue ex VAT (taxable base after discount); the estimate header "Выручка". */
  contractValueCents: number;
  /** Cost basis (себестоимость), same as the header cost card. */
  costCents: number;
  /** contractValue − cost (маржа в ₽). */
  marginCents: number;
  /** spent / cost × 100, unclamped (UI clamps bars itself); null when cost is 0. */
  percentUtilization: number | null;
  /** Works linked to a task whose task is done (ProjectEstimate taskCompletion semantics). */
  tasksDone: number;
  /** Works linked to a task (the completion denominator). */
  tasksTotal: number;
  /** tasksDone / tasksTotal × 100; null when no linked tasks. */
  percentComplete: number | null;
  /** Days until the current works range ends (>= 0); null when dates are missing. */
  daysToEnd: number | null;
  /** Behind-schedule days vs baseline; 0 unless overdue with unfinished linked tasks. */
  behindScheduleDays: number;
  /**
   * When false, monetary fields are cleared and workspace totals exclude this project (Home sensitive-detail gate).
   * Omitted means fully visible (legacy callers).
   */
  sensitiveFinanceVisible?: boolean;
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
> & Partial<Pick<EstimateV2ProjectView, "scheduleBaseline">>;

function worksRangeDays(works: EstimateV2Work[]): { startDay: number; endDay: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  works.forEach((work) => {
    const start = toDayIndex(work.plannedStart);
    const end = toDayIndex(work.plannedEnd);
    if (start == null || end == null) return;
    min = Math.min(min, start);
    max = Math.max(max, end);
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { startDay: min, endDay: max };
}

/**
 * Same timing semantics as the estimate header: days-to-end from the current works range
 * (baseline end as fallback), behind-days only past the baseline with unfinished linked tasks.
 * Without a tasks slice — including an EMPTY one, which is what still-loading task queries
 * return — behind-days stays 0, so loading and missing data take the same no-false-alarm path.
 */
function computeSummaryTiming(
  works: EstimateV2Work[],
  scheduleBaseline: ScheduleBaseline | null | undefined,
  tasks: EstimateV2FinanceTaskSlice[] | undefined,
): { daysToEnd: number | null; behindScheduleDays: number } {
  const todayDay = toDayIndex(new Date());
  const currentRange = worksRangeDays(works);
  const baselineEndDay = scheduleBaseline?.projectBaselineEnd
    ? toDayIndex(scheduleBaseline.projectBaselineEnd)
    : null;
  const targetEndDay = currentRange?.endDay ?? baselineEndDay;
  const daysToEnd = targetEndDay != null && todayDay != null
    ? Math.max(0, targetEndDay - todayDay)
    : null;

  let behindScheduleDays = 0;
  if (tasks && tasks.length > 0 && baselineEndDay != null && todayDay != null && todayDay > baselineEndDay) {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const unfinishedLinked = works.reduce((count, work) => {
      if (!work.taskId) return count;
      const task = taskById.get(work.taskId);
      if (!task) return count + 1;
      return task.status === "done" ? count : count + 1;
    }, 0);
    if (unfinishedLinked > 0) behindScheduleDays = todayDay - baselineEndDay;
  }

  return { daysToEnd, behindScheduleDays };
}

/**
 * ProjectEstimate taskCompletion semantics: count works linked to a task; a work is "done"
 * when its linked task is done. Without a tasks slice (or an empty still-loading one) the
 * denominator is 0 and percentComplete is null.
 */
function computeSummaryCompletion(
  works: EstimateV2Work[],
  tasks: EstimateV2FinanceTaskSlice[] | undefined,
): { tasksDone: number; tasksTotal: number; percentComplete: number | null } {
  if (!tasks || tasks.length === 0) {
    return { tasksDone: 0, tasksTotal: 0, percentComplete: null };
  }
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  let total = 0;
  let done = 0;
  works.forEach((work) => {
    if (!work.taskId) return;
    total += 1;
    const task = taskById.get(work.taskId);
    if (task && task.status === "done") done += 1;
  });
  return {
    tasksDone: done,
    tasksTotal: total,
    percentComplete: total > 0 ? (done / total) * 100 : null,
  };
}

/**
 * Pure summary from estimate-v2 state + fact rollups (same fact path as ProjectEstimate when inputs match).
 */
export function buildEstimateV2FinanceProjectSummary(
  projectId: string,
  projectTitle: string,
  state: EstimateV2FinanceStateSlice,
  fact: FactRollups,
  tasks?: EstimateV2FinanceTaskSlice[],
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
    state.project.projectMode,
  );
  const revenueExVatCents = pricingTotals.taxableBaseCents;
  const costExVatCents = pricingTotals.costTotalCents;
  const percentProfitability = revenueExVatCents > 0
    ? ((revenueExVatCents - costExVatCents) / revenueExVatCents) * 100
    : null;

  const contractValueCents = hasEstimate ? revenueExVatCents : 0;
  const costCents = hasEstimate ? costExVatCents : 0;
  const percentUtilization = costCents > 0 ? (spentCents / costCents) * 100 : null;
  const timing = hasEstimate
    ? computeSummaryTiming(state.works, state.scheduleBaseline, tasks)
    : { daysToEnd: null, behindScheduleDays: 0 };
  const completion = hasEstimate
    ? computeSummaryCompletion(state.works, tasks)
    : { tasksDone: 0, tasksTotal: 0, percentComplete: null };

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
    contractValueCents,
    costCents,
    marginCents: contractValueCents - costCents,
    percentUtilization,
    tasksDone: completion.tasksDone,
    tasksTotal: completion.tasksTotal,
    percentComplete: completion.percentComplete,
    daysToEnd: timing.daysToEnd,
    behindScheduleDays: timing.behindScheduleDays,
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
  return buildEstimateV2FinanceProjectSummary(project.id, project.title, state, fact, getTasks(projectId));
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

/**
 * Home-only: strip per-project monetary fields when the viewer lacks sensitive-detail access,
 * and recompute workspace totals from allowed projects only.
 */
export function applySensitiveDetailToEstimateV2FinanceSnapshot(
  snapshot: EstimateV2FinanceSnapshot,
  canViewSensitiveDetail: (projectId: string) => boolean,
): EstimateV2FinanceSnapshot {
  const totals = {
    plannedBudgetCents: 0,
    spentCents: 0,
    toBePaidCents: 0,
    varianceCents: 0,
  };

  const projects = snapshot.projects.map((summary) => {
    const sensitiveFinanceVisible = canViewSensitiveDetail(summary.projectId);
    if (sensitiveFinanceVisible) {
      totals.plannedBudgetCents += summary.plannedBudgetCents;
      totals.spentCents += summary.spentCents;
      totals.toBePaidCents += summary.toBePaidCents;
      totals.varianceCents += summary.varianceCents;
      return { ...summary, sensitiveFinanceVisible: true };
    }
    return {
      ...summary,
      sensitiveFinanceVisible: false,
      plannedBudgetCents: 0,
      spentCents: 0,
      toBePaidCents: 0,
      varianceCents: 0,
      percentSpent: 0,
      percentProfitability: null,
      contractValueCents: 0,
      costCents: 0,
      marginCents: 0,
      percentUtilization: null,
    };
  });

  return { projects, totals };
}
