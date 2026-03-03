import { describe, expect, it } from "vitest";
import type { EstimateV2Dependency, EstimateV2Work } from "@/types/estimate-v2";
import { applyFSConstraints, autoScheduleSequential, validateNoCycles } from "@/lib/estimate-v2/schedule";

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
    const result = validateNoCycles([
      dep("a", "b"),
      dep("b", "c"),
      dep("c", "a"),
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.cyclePath.length).toBeGreaterThan(0);
    }
  });

  it("applies FS constraints with lag days", () => {
    const scheduled = [
      work("a", "stage-1", 1, {
        plannedStart: "2025-01-10T00:00:00.000Z",
        plannedEnd: "2025-01-10T00:00:00.000Z",
      }),
      work("b", "stage-1", 2, {
        plannedStart: "2025-01-10T00:00:00.000Z",
        plannedEnd: "2025-01-10T00:00:00.000Z",
      }),
    ];

    const constrained = applyFSConstraints(scheduled, [dep("a", "b", 2)]);
    const b = constrained.find((entry) => entry.id === "b");
    const bStart = new Date(b?.plannedStart ?? "");
    const bEnd = new Date(b?.plannedEnd ?? "");

    expect(bStart.getDate()).toBe(12);
    expect(bEnd.getDate()).toBe(12);
  });
});
