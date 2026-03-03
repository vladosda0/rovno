import { describe, expect, it } from "vitest";
import type { EstimateV2Dependency, EstimateV2Work } from "@/types/estimate-v2";
import {
  applyFSConstraints,
  autoScheduleSequential,
  clampWorkDates,
  detectCycle,
  earliestAllowedStart,
  toDayIndex,
  validateAndFixOnDrag,
} from "@/lib/estimate-v2/schedule";

function work(id: string, stageId: string, order: number, partial: Partial<EstimateV2Work> = {}): EstimateV2Work {
  return {
    id,
    projectId: "project-1",
    stageId,
    title: id,
    order,
    discountBps: 0,
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...partial,
  };
}

function dep(fromWorkId: string, toWorkId: string, lagDays = 0): EstimateV2Dependency {
  return {
    id: `${fromWorkId}-${toWorkId}`,
    projectId: "project-1",
    kind: "FS",
    fromWorkId,
    toWorkId,
    lagDays,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function worksById(works: EstimateV2Work[]): Record<string, EstimateV2Work> {
  return Object.fromEntries(works.map((entry) => [entry.id, entry]));
}

describe("estimate-v2 schedule helpers", () => {
  it("auto schedules sequentially by stage then work order", () => {
    const works = [
      work("w-2", "stage-2", 1),
      work("w-1-2", "stage-1", 2),
      work("w-1-1", "stage-1", 1),
    ];
    const stageOrderById = new Map([
      ["stage-1", 1],
      ["stage-2", 2],
    ]);

    const scheduled = autoScheduleSequential(works, "2025-01-10T10:00:00.000Z", stageOrderById);
    const byId = new Map(scheduled.map((entry) => [entry.id, entry]));
    const w11Start = new Date(byId.get("w-1-1")?.plannedStart ?? "");
    const w12Start = new Date(byId.get("w-1-2")?.plannedStart ?? "");
    const w2Start = new Date(byId.get("w-2")?.plannedStart ?? "");

    expect(w11Start.getDate()).toBe(10);
    expect(w12Start.getDate()).toBe(11);
    expect(w2Start.getDate()).toBe(12);
  });

  it("detects dependency cycles", () => {
    const result = detectCycle(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        dep("a", "b"),
        dep("b", "c"),
        dep("c", "a"),
      ],
    );
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath.length).toBeGreaterThan(0);
  });

  it("returns earliest allowed start for FS + lag", () => {
    const works = worksById([
      work("a", "stage-1", 1, {
        plannedStart: "2025-01-10T00:00:00.000Z",
        plannedEnd: "2025-01-10T00:00:00.000Z",
      }),
      work("b", "stage-1", 2, {
        plannedStart: "2025-01-09T00:00:00.000Z",
        plannedEnd: "2025-01-09T00:00:00.000Z",
      }),
    ]);

    const earliest = earliestAllowedStart("b", [dep("a", "b", 2)], works);
    const expected = (toDayIndex("2025-01-10T00:00:00.000Z") as number) + 2;

    expect(earliest).toBe(expected);
  });

  it("snaps dragged range to earliest valid FS start", () => {
    const works = worksById([
      work("a", "stage-1", 1, {
        plannedStart: "2025-01-10T00:00:00.000Z",
        plannedEnd: "2025-01-10T00:00:00.000Z",
      }),
      work("b", "stage-1", 2, {
        plannedStart: "2025-01-11T00:00:00.000Z",
        plannedEnd: "2025-01-11T00:00:00.000Z",
      }),
    ]);

    const fixed = validateAndFixOnDrag(
      "b",
      toDayIndex("2025-01-09T00:00:00.000Z") as number,
      toDayIndex("2025-01-09T00:00:00.000Z") as number,
      [dep("a", "b", 2)],
      works,
    );

    expect(fixed.fixedStart).toBe((toDayIndex("2025-01-10T00:00:00.000Z") as number) + 2);
    expect(fixed.reasons).toContain("fs_snap");
  });

  it("pushes successor chain forward deterministically", () => {
    const constrained = applyFSConstraints(
      worksById([
        work("a", "stage-1", 1, {
          plannedStart: "2025-01-10T00:00:00.000Z",
          plannedEnd: "2025-01-10T00:00:00.000Z",
        }),
        work("b", "stage-1", 2, {
          plannedStart: "2025-01-10T00:00:00.000Z",
          plannedEnd: "2025-01-11T00:00:00.000Z",
        }),
        work("c", "stage-1", 3, {
          plannedStart: "2025-01-10T00:00:00.000Z",
          plannedEnd: "2025-01-10T00:00:00.000Z",
        }),
      ]),
      [
        dep("b", "c", 1),
        dep("a", "b", 1),
      ],
    );

    expect(new Date(constrained.b.plannedStart ?? "").getDate()).toBe(11);
    expect(new Date(constrained.b.plannedEnd ?? "").getDate()).toBe(12);
    expect(new Date(constrained.c.plannedStart ?? "").getDate()).toBe(13);
  });

  it("enforces minimum one-day duration", () => {
    const clamped = clampWorkDates({
      plannedStart: "2025-01-10T00:00:00.000Z",
      plannedEnd: "2025-01-08T00:00:00.000Z",
    });

    expect(new Date(clamped.plannedStart).getDate()).toBe(10);
    expect(new Date(clamped.plannedEnd).getDate()).toBe(10);

    const fixed = validateAndFixOnDrag("x", 20, 19, [], {});
    expect(fixed.fixedStart).toBe(20);
    expect(fixed.fixedEnd).toBe(20);
    expect(fixed.reasons).toContain("min_duration");
  });
});
