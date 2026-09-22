import type { EstimateExecutionStatus } from "@/types/estimate-v2";

/**
 * A project's status IS its estimate's execution status — the one the user sets
 * on the estimate page (Планирование → В работу → Приостановить → Завершить).
 * There is no separate status column on `projects`, and the old project lists
 * read a status off `projects.progress_pct`, a column written once at creation
 * and never updated. That labelled every real project "Черновик" forever, a
 * state the product does not have at all.
 */
export type ProjectStatus = EstimateExecutionStatus;

export interface ProjectTaskStatusCounts {
  not_started: number;
  in_progress: number;
  done: number;
  blocked: number;
}

export const EMPTY_PROJECT_TASK_STATUS_COUNTS: ProjectTaskStatusCounts = {
  not_started: 0,
  in_progress: 0,
  done: 0,
  blocked: 0,
};

/** What a project list needs to show a status and a progress bar for one project. */
export interface ProjectStatusSummary {
  /** `project_estimates.execution_status`. Authoritative whenever it is set. */
  executionStatus: EstimateExecutionStatus | null;
  /** `project_estimates.status === "approved"`. */
  estimateApproved: boolean;
  /**
   * Хотя бы один пункт чеклиста задачи привязан к смете. Третий сигнал стора
   * смет (estimate-v2-store.ts): без него главная говорила «Планирование» там,
   * где страница сметы уже говорит «В работе».
   */
  hasLinkedEstimateChecklist: boolean;
  taskCounts: ProjectTaskStatusCounts;
}

/**
 * Legacy rows carry "completed" where the app writes "done"; the project
 * dashboard has always counted both, so this normalization keeps the home list
 * and the dashboard from disagreeing about the same project.
 */
export function normalizeTaskStatus(status: string): keyof ProjectTaskStatusCounts | null {
  if (status === "completed") return "done";
  if (status === "not_started" || status === "in_progress" || status === "done" || status === "blocked") {
    return status;
  }
  return null;
}

/**
 * Takes a plain `{ status: string }` rather than the `Task` row type because
 * callers outside the planning store (the AI context pack) carry rows straight
 * off the wire, where a legacy status outside the `TaskStatus` union is exactly
 * the case `normalizeTaskStatus` exists to absorb.
 */
export function countTaskStatuses(
  tasks: ReadonlyArray<{ status: string }>,
): ProjectTaskStatusCounts {
  const counts: ProjectTaskStatusCounts = { ...EMPTY_PROJECT_TASK_STATUS_COUNTS };
  for (const task of tasks) {
    const key = normalizeTaskStatus(task.status);
    if (key) counts[key] += 1;
  }
  return counts;
}

export function totalTaskCount(counts: ProjectTaskStatusCounts): number {
  return counts.not_started + counts.in_progress + counts.done + counts.blocked;
}

export function deriveProjectStatus(summary: ProjectStatusSummary): ProjectStatus {
  if (summary.executionStatus) return summary.executionStatus;
  // `execution_status` is null on rows written before the column existed, and on
  // drafts whose mirror write was lost. На staging 22.09.2026 таких смет 24 из
  // 33, то есть это обычная ветка, а не редкая.
  //
  // Три сигнала, ровно те же и в том же порядке, что у ВЫВОДА стора смет
  // (`inferredEstimateStatus`, estimate-v2-store.ts): одобренный корень, пункт
  // чеклиста, привязанный к смете, и начатая задача. Третий добавлен по решению
  // владельца 22.09.2026: без него главная говорила «Планирование» там, где
  // страница сметы говорит «В работе», на трёх живых проектах стенда.
  //
  // Совпадает именно ВЫВОД, а не вся цепочка стора. Выше вывода у него стоит
  // ещё одна ступень: сохранённый в localStorage статус, если он не
  // «planning». Её здесь нет и быть не может — это состояние одного браузера,
  // а список рисуется для всех проектов сразу. Практическое следствие: проект,
  // который человек приостановил, но чья зеркальная запись до сервера не
  // доехала, на странице сметы читается «Приостановлено», а в списке — нет.
  // Список вообще не умеет выводить «Приостановлено» и «Завершено»: серверного
  // сигнала для них не существует, и угадывать их запрещено.
  //
  // Настоящая причина расхождения — потерянная зеркальная запись, и она
  // заведена отдельно. Меняешь правило вывода здесь — меняй и там.
  const started = summary.taskCounts.in_progress
    + summary.taskCounts.done
    + summary.taskCounts.blocked > 0;
  if (summary.estimateApproved || summary.hasLinkedEstimateChecklist || started) return "in_work";
  return "planning";
}

/**
 * Share of finished tasks — the same formula the project dashboard uses, КРОМЕ
 * случая, когда задач нет вовсе: дашборд показывает тогда 0, а здесь берётся
 * сохранённое `progress_pct`. На стенде таких проектов ноль, и единственный
 * писатель колонки пишет в неё 0, так что расхождение недостижимо — но оно
 * есть в коде, и обещать полное совпадение здесь нельзя.
 */
export function deriveProjectProgressPct(
  counts: ProjectTaskStatusCounts,
  fallbackPct: number,
): number {
  const total = totalTaskCount(counts);
  if (total === 0) return fallbackPct;
  return Math.round((counts.done / total) * 100);
}

/** The estimate page's own wording, so one project never has two names for one state. */
export const PROJECT_STATUS_LABEL_KEY: Record<ProjectStatus, string> = {
  planning: "estimate.status.planning",
  in_work: "estimate.status.inWork",
  paused: "estimate.status.paused",
  finished: "estimate.status.finished",
};

export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  planning: "bg-muted text-muted-foreground",
  in_work: "bg-info/15 text-info",
  // text-warning, а не text-warning-foreground: второй токен белый
  // (--warning-foreground: 0 0% 100%) и на 15% заливке нечитаем. Та же ошибка
  // уже описана в ParticipantsScreen.tsx.
  paused: "bg-warning/15 text-warning",
  finished: "bg-success/15 text-success",
};
