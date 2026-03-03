import { afterEach, describe, expect, it } from "vitest";
import {
  computeVersionDiff,
  getEstimateV2ProjectState,
  setRegime,
  setRegimeDev,
} from "@/data/estimate-v2-store";
import { setAuthRole } from "@/lib/auth-state";
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
    estimateStatus: "draft",
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
