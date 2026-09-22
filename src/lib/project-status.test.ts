import { describe, expect, it } from "vitest";
import ruLocale from "@/locales/ru.json";
import enLocale from "@/locales/en.json";
import {
  countTaskStatuses,
  deriveProjectProgressPct,
  deriveProjectStatus,
  EMPTY_PROJECT_TASK_STATUS_COUNTS,
  PROJECT_STATUS_LABEL_KEY,
  type ProjectStatus,
  type ProjectStatusSummary,
  type ProjectTaskStatusCounts,
} from "@/lib/project-status";

function taskCounts(overrides: Partial<ProjectTaskStatusCounts> = {}): ProjectTaskStatusCounts {
  return { ...EMPTY_PROJECT_TASK_STATUS_COUNTS, ...overrides };
}

function summary(overrides: Partial<ProjectStatusSummary> = {}): ProjectStatusSummary {
  return {
    executionStatus: null,
    estimateApproved: false,
    hasLinkedEstimateChecklist: false,
    taskCounts: taskCounts(),
    ...overrides,
  };
}

describe("deriveProjectStatus", () => {
  // The status the user sets on the estimate page is the project's status. The
  // product has no drafts, and nothing here invents a state the user never chose.
  it("reports the estimate's execution status verbatim", () => {
    expect(deriveProjectStatus(summary({ executionStatus: "planning" }))).toBe("planning");
    expect(deriveProjectStatus(summary({ executionStatus: "in_work" }))).toBe("in_work");
    expect(deriveProjectStatus(summary({ executionStatus: "paused" }))).toBe("paused");
    expect(deriveProjectStatus(summary({ executionStatus: "finished" }))).toBe("finished");
  });

  // Третий сигнал вывода, добавленный по решению владельца 22.09.2026.
  // Без него главная говорила «Планирование» там, где страница сметы уже
  // говорит «В работе»: на стенде это расходилось на трёх живых проектах,
  // у которых нет ни одобренного корня, ни начатой задачи, но есть пункт
  // чеклиста, привязанный к смете. Ветка обязана совпадать с
  // `inferredEstimateStatus` в estimate-v2-store.ts.
  it("считает проект начатым по связанному со сметой чеклисту", () => {
    expect(deriveProjectStatus(summary({
      executionStatus: null,
      estimateApproved: false,
      hasLinkedEstimateChecklist: true,
      taskCounts: taskCounts({ not_started: 4 }),
    }))).toBe("in_work");
  });

  // Обратная сторона того же: без связанного чеклиста та же фикстура обязана
  // остаться «Планированием», иначе сигнал не различает ничего.
  it("без связанного чеклиста та же фикстура остаётся планированием", () => {
    expect(deriveProjectStatus(summary({
      executionStatus: null,
      estimateApproved: false,
      hasLinkedEstimateChecklist: false,
      taskCounts: taskCounts({ not_started: 4 }),
    }))).toBe("planning");
  });

  // Записанный статус выигрывает у всех трёх сигналов, а не только у двух.
  it("записанный статус выигрывает у связанного чеклиста", () => {
    expect(deriveProjectStatus(summary({
      executionStatus: "planning",
      hasLinkedEstimateChecklist: true,
    }))).toBe("planning");
  });

  // A paused project stays paused even while its tasks look busy: the human
  // decision outranks the inference, exactly as it does on the estimate page.
  it("keeps a paused project paused even with work in flight", () => {
    expect(deriveProjectStatus(summary({
      executionStatus: "paused",
      estimateApproved: true,
      taskCounts: taskCounts({ in_progress: 3, done: 2 }),
    }))).toBe("paused");
  });

  describe("when the estimate has no execution status yet", () => {
    it("reads a project with nothing started as planning", () => {
      expect(deriveProjectStatus(summary())).toBe("planning");
      expect(deriveProjectStatus(summary({ taskCounts: taskCounts({ not_started: 4 }) }))).toBe("planning");
    });

    // Same two fallbacks the estimate store applies to pre-column rows, so the
    // list and the estimate page cannot disagree about one project.
    it("reads an approved estimate as in work", () => {
      expect(deriveProjectStatus(summary({ estimateApproved: true }))).toBe("in_work");
    });

    it("reads any task that left 'not started' as in work", () => {
      expect(deriveProjectStatus(summary({ taskCounts: taskCounts({ in_progress: 1 }) }))).toBe("in_work");
      expect(deriveProjectStatus(summary({ taskCounts: taskCounts({ done: 1 }) }))).toBe("in_work");
      expect(deriveProjectStatus(summary({ taskCounts: taskCounts({ blocked: 1 }) }))).toBe("in_work");
    });
  });
});

describe("deriveProjectProgressPct", () => {
  it("measures the share of finished tasks", () => {
    expect(deriveProjectProgressPct(taskCounts({ done: 1, not_started: 3 }), 45)).toBe(25);
    expect(deriveProjectProgressPct(taskCounts({ done: 3 }), 0)).toBe(100);
  });

  // `projects.progress_pct` is written once at creation and never updated, so it
  // is only trustworthy while there is nothing to measure against.
  it("falls back to the stored percentage only when there are no tasks", () => {
    expect(deriveProjectProgressPct(EMPTY_PROJECT_TASK_STATUS_COUNTS, 45)).toBe(45);
  });
});

describe("countTaskStatuses", () => {
  it("counts the legacy completed status as done", () => {
    expect(countTaskStatuses([
      { status: "completed" as never },
      { status: "done" as never },
      { status: "in_progress" as never },
    ])).toEqual(taskCounts({ done: 2, in_progress: 1 }));
  });

  it("ignores statuses that are not task statuses", () => {
    expect(countTaskStatuses([{ status: "approved" as never }])).toEqual(
      EMPTY_PROJECT_TASK_STATUS_COUNTS,
    );
  });
});

describe("PROJECT_STATUS_LABEL_KEY", () => {
  // The badge reuses the estimate page's own wording so one project never has
  // two names for one state. A renamed key there would silently print the key.
  it("points at real estimate status labels in both locales", () => {
    const expected: Record<ProjectStatus, [string, string]> = {
      planning: ["Планирование", "Planning"],
      in_work: ["В работе", "In work"],
      paused: ["Приостановлено", "Paused"],
      finished: ["Завершено", "Finished"],
    };

    (Object.keys(expected) as ProjectStatus[]).forEach((status) => {
      const key = PROJECT_STATUS_LABEL_KEY[status];
      const [ru, en] = expected[status];
      expect((ruLocale as Record<string, string>)[key]).toBe(ru);
      expect((enLocale as Record<string, string>)[key]).toBe(en);
    });
  });
});
