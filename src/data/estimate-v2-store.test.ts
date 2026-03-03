import { afterEach, describe, expect, it } from "vitest";
import {
  addDependency,
  computeVersionDiff,
  getEstimateV2ProjectState,
  updateWorkDates,
  setProjectEstimateStatus,
  setRegime,
  setRegimeDev,
  updateLine,
} from "@/data/estimate-v2-store";
import { getTask, updateChecklist, updateTask } from "@/data/store";
import { setAuthRole } from "@/lib/auth-state";
import { toDayIndex } from "@/lib/estimate-v2/schedule";
import type {
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Snapshot,
  EstimateV2Stage,
  EstimateV2Version,
  EstimateV2Work,
} from "@/types/estimate-v2";

function project(partial: Partial<EstimateV2Project> = {}): EstimateV2Project {
  return {
    id: "estimate-v2-project-1",
    projectId: "project-1",
    title: "Project",
    currency: "RUB",
    regime: "contractor",
    taxBps: 2000,
    discountBps: 0,
    markupBps: 0,
    estimateStatus: "planning",
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function stage(id: string, title: string, order: number): EstimateV2Stage {
  return {
    id,
    projectId: "project-1",
    title,
    order,
    discountBps: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function work(id: string, stageId: string, title: string, order: number): EstimateV2Work {
  return {
    id,
    projectId: "project-1",
    stageId,
    title,
    order,
    discountBps: 0,
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function line(partial: Partial<EstimateV2ResourceLine> = {}): EstimateV2ResourceLine {
  return {
    id: "line-1",
    projectId: "project-1",
    stageId: "stage-1",
    workId: "work-1",
    title: "Штукатурка гипсовая 10кг",
    type: "material",
    unit: "bag",
    qtyMilli: 3_000,
    costUnitCents: 1_500,
    markupBps: 500,
    discountBpsOverride: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function snapshot(input: {
  project?: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
}): EstimateV2Snapshot {
  return {
    project: input.project ?? project(),
    stages: input.stages,
    works: input.works,
    lines: input.lines,
    dependencies: [],
  };
}

function version(id: string, number: number, snap: EstimateV2Snapshot): EstimateV2Version {
  return {
    id,
    projectId: "project-1",
    number,
    status: "proposed",
    snapshot: snap,
    shareId: `share-${id}`,
    approvalStamp: null,
    archived: false,
    submitted: true,
    createdBy: "user-1",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("estimate-v2 store computeVersionDiff", () => {
  it("returns structured changes with human labels and numbering", () => {
    const prevSnapshot = snapshot({
      stages: [stage("stage-1", "Монтаж", 1)],
      works: [work("work-1", "stage-1", "Покраска стен", 1)],
      lines: [line()],
    });

    const nextSnapshot = snapshot({
      stages: [
        stage("stage-1", "Монтаж", 1),
        stage("stage-2", "Финиш", 2),
      ],
      works: [
        work("work-1", "stage-1", "Покраска стен", 1),
        work("work-2", "stage-2", "Уборка", 1),
      ],
      lines: [line()],
    });

    const diff = computeVersionDiff(version("v1", 1, prevSnapshot), version("v2", 2, nextSnapshot));

    const addedStage = diff.changes.find((entry) => entry.entityKind === "stage" && entry.entityId === "stage-2");
    const addedWork = diff.changes.find((entry) => entry.entityKind === "work" && entry.entityId === "work-2");

    expect(addedStage?.changeType).toBe("added");
    expect(addedStage?.stageNumber).toBe(2);
    expect(addedStage?.title).toBe("Финиш");

    expect(addedWork?.changeType).toBe("added");
    expect(addedWork?.stageNumber).toBe(2);
    expect(addedWork?.workNumber).toBe("2.1");
    expect(addedWork?.title).toBe("Уборка");
  });

  it("reports key line field changes including client totals", () => {
    const prevSnapshot = snapshot({
      stages: [stage("stage-1", "Монтаж", 1)],
      works: [work("work-1", "stage-1", "Покраска стен", 1)],
      lines: [line()],
    });

    const nextSnapshot = snapshot({
      stages: [stage("stage-1", "Монтаж", 1)],
      works: [work("work-1", "stage-1", "Покраска стен", 1)],
      lines: [line({ qtyMilli: 4_000, type: "tool", title: "Валик малярный", unit: "pcs" })],
    });

    const diff = computeVersionDiff(version("v1", 1, prevSnapshot), version("v2", 2, nextSnapshot));
    const lineChange = diff.changes.find((entry) => entry.entityKind === "line" && entry.entityId === "line-1");

    expect(lineChange?.changeType).toBe("updated");
    const fields = new Set((lineChange?.fieldChanges ?? []).map((entry) => entry.field));

    expect(fields.has("title")).toBe(true);
    expect(fields.has("type")).toBe(true);
    expect(fields.has("qtyMilli")).toBe(true);
    expect(fields.has("unit")).toBe(true);
    expect(fields.has("clientTotalCents")).toBe(true);
  });
});

describe("estimate-v2 regime switching", () => {
  afterEach(() => {
    setAuthRole("owner");
  });

  it("setRegimeDev updates regime for seeded demo projects in DEV", () => {
    const ok = setRegimeDev("project-1", "client");
    expect(ok).toBe(true);
    const state = getEstimateV2ProjectState("project-1");
    expect(state.project.regime).toBe("client");
  });

  it("setRegimeDev rejects non-demo projects", () => {
    const ok = setRegimeDev("project-manual-test", "client");
    expect(ok).toBe(false);
  });

  it("setRegime keeps owner-only role gate unchanged", () => {
    setAuthRole("viewer");
    const blocked = setRegime("project-1", "build_myself");
    expect(blocked).toBe(false);

    setAuthRole("owner");
    const allowed = setRegime("project-1", "build_myself");
    expect(allowed).toBe(true);
  });
});

describe("estimate-v2 execution foundation", () => {
  afterEach(() => {
    setAuthRole("owner");
  });

  it("captures baseline, auto-schedules missing dates, and materializes tasks on planning -> in_work", () => {
    const projectId = "project-2";
    setAuthRole("owner");

    const blocked = setProjectEstimateStatus(projectId, "in_work");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("missing_work_dates");
    expect((blocked.missingWorkIds ?? []).length).toBeGreaterThan(0);

    const transitioned = setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    expect(transitioned.ok).toBe(true);
    expect(transitioned.autoScheduled).toBe(true);
    expect(transitioned.baselineCaptured).toBe(true);

    const state = getEstimateV2ProjectState(projectId);
    expect(state.project.estimateStatus).toBe("in_work");
    expect(state.scheduleBaseline).not.toBeNull();
    expect(state.scheduleBaseline?.works.length).toBe(state.works.length);

    state.works.forEach((work) => {
      expect(work.plannedStart).toBeTruthy();
      expect(work.plannedEnd).toBeTruthy();
      expect(work.taskId).toBeTruthy();
      const task = getTask(work.taskId as string);
      expect(task?.title).toBe(work.title);
      expect(task?.startDate ?? null).toBe(work.plannedStart);
      expect(task?.deadline ?? null).toBe(work.plannedEnd);
      expect(task?.status).toBe("not_started");
    });
  });

  it("blocks finished status when linked tasks are not done", () => {
    const projectId = "project-3";
    setAuthRole("owner");

    setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    const blocked = setProjectEstimateStatus(projectId, "finished");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("incomplete_tasks");
    expect((blocked.incompleteTasks ?? []).length).toBeGreaterThan(0);

    const state = getEstimateV2ProjectState(projectId);
    state.works.forEach((work) => {
      if (!work.taskId) return;
      updateTask(work.taskId, { status: "done" });
    });

    const allowed = setProjectEstimateStatus(projectId, "finished");
    expect(allowed.ok).toBe(true);
    const finishedState = getEstimateV2ProjectState(projectId);
    expect(finishedState.project.estimateStatus).toBe("finished");
  });

  it("keeps task/work and resource/checklist sync in both directions", () => {
    const projectId = "project-1";
    setAuthRole("owner");

    setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    const state = getEstimateV2ProjectState(projectId);
    const workToSync = state.works[0];
    expect(workToSync.taskId).toBeTruthy();

    updateTask(workToSync.taskId as string, {
      title: "Renamed from task side",
      status: "in_progress",
    });

    const afterTaskUpdate = getEstimateV2ProjectState(projectId);
    const syncedWork = afterTaskUpdate.works.find((work) => work.id === workToSync.id);
    expect(syncedWork?.title).toBe("Renamed from task side");
    expect(syncedWork?.status).toBe("in_progress");

    const lineToSync = afterTaskUpdate.lines.find((line) => line.workId === workToSync.id);
    expect(lineToSync).toBeDefined();
    updateLine(projectId, lineToSync!.id, {
      title: "Updated line title",
      qtyMilli: 7_777,
      unit: "kg",
    });

    const taskAfterLineUpdate = getTask(workToSync.taskId as string);
    const checklistItem = taskAfterLineUpdate?.checklist.find((item) => item.estimateV2LineId === lineToSync!.id);
    expect(checklistItem?.text).toBe("Updated line title");
    expect(checklistItem?.estimateV2QtyMilli).toBe(7_777);
    expect(checklistItem?.estimateV2Unit).toBe("kg");

    updateChecklist(
      workToSync.taskId as string,
      (taskAfterLineUpdate?.checklist ?? []).map((item) => (
        item.estimateV2LineId === lineToSync!.id
          ? {
            ...item,
            text: "Checklist rename",
            estimateV2QtyMilli: 8_888,
            estimateV2Unit: "pack",
          }
          : item
      )),
    );

    const afterChecklistUpdate = getEstimateV2ProjectState(projectId);
    const syncedLine = afterChecklistUpdate.lines.find((line) => line.id === lineToSync!.id);
    expect(syncedLine?.title).toBe("Checklist rename");
    expect(syncedLine?.qtyMilli).toBe(8_888);
    expect(syncedLine?.unit).toBe("pack");
  });

  it("blocks dependency creation when it introduces a cycle", () => {
    const projectId = "project-2";
    setAuthRole("owner");

    setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    const state = getEstimateV2ProjectState(projectId);
    expect(state.works.length).toBeGreaterThanOrEqual(2);

    const from = state.works[0];
    const to = state.works[1];
    const initialDepsCount = state.dependencies.length;

    const first = addDependency(projectId, from.id, to.id, 0);
    expect(first.ok).toBe(true);

    const cyclic = addDependency(projectId, to.id, from.id, 0);
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) {
      expect(cyclic.reason).toBe("cycle");
    }

    const after = getEstimateV2ProjectState(projectId);
    expect(after.dependencies.length).toBe(initialDepsCount + 1);
  });

  it("updates linked task dates in in_work without changing baseline snapshot", () => {
    const projectId = "project-3";
    setAuthRole("owner");

    setProjectEstimateStatus(projectId, "planning");
    const inWork = setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    expect(inWork.ok).toBe(true);

    const before = getEstimateV2ProjectState(projectId);
    expect(before.scheduleBaseline).not.toBeNull();

    const workToUpdate = before.works.find((work) => Boolean(work.taskId));
    expect(workToUpdate).toBeDefined();

    const baselineBefore = JSON.stringify(before.scheduleBaseline);
    const nextStart = "2025-05-01T00:00:00.000Z";
    const nextEnd = "2025-05-03T00:00:00.000Z";

    const result = updateWorkDates(projectId, workToUpdate!.id, nextStart, nextEnd, { source: "gantt" });
    expect(result.ok).toBe(true);

    const after = getEstimateV2ProjectState(projectId);
    const updatedWork = after.works.find((work) => work.id === workToUpdate!.id);
    expect(toDayIndex(updatedWork?.plannedStart ?? null)).toBe(toDayIndex(nextStart));
    expect(toDayIndex(updatedWork?.plannedEnd ?? null)).toBe(toDayIndex(nextEnd));

    const linkedTask = getTask(workToUpdate!.taskId as string);
    expect(toDayIndex(linkedTask?.startDate ?? null)).toBe(toDayIndex(nextStart));
    expect(toDayIndex(linkedTask?.deadline ?? null)).toBe(toDayIndex(nextEnd));

    expect(JSON.stringify(after.scheduleBaseline)).toBe(baselineBefore);
  });
});
