import { describe, expect, it } from "vitest";
import {
  mapProjectStageRowToStage,
  mapTaskRowToTask,
} from "@/data/planning-source";

function projectStageRow(
  overrides: Partial<Parameters<typeof mapProjectStageRowToStage>[0]> = {},
) {
  return {
    id: "stage-1",
    project_id: "project-1",
    title: "Rough-In",
    description: "Electrical and plumbing",
    sort_order: 2,
    status: "open" as const,
    discount_bps: 0,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function taskRow(overrides: Partial<Parameters<typeof mapTaskRowToTask>[0]> = {}) {
  return {
    id: "task-1",
    project_id: "project-1",
    stage_id: "stage-1",
    title: "Install outlets",
    description: "Wire and install outlets",
    status: "in_progress" as const,
    assignee_profile_id: "profile-2",
    estimate_work_id: "work-1",
    created_by: "profile-1",
    start_at: "2026-03-02T00:00:00.000Z",
    due_at: "2026-03-05T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("planning-source helpers", () => {
  it("maps project stage rows to the frontend Stage contract", () => {
    const stage = mapProjectStageRowToStage(projectStageRow({
      sort_order: 4,
      status: "completed",
    }));

    expect(stage).toEqual({
      id: "stage-1",
      project_id: "project-1",
      title: "Rough-In",
      description: "Electrical and plumbing",
      order: 4,
      status: "completed",
    });
  });

  it("maps task rows to the frontend Task contract with empty-safe defaults", () => {
    const task = mapTaskRowToTask(taskRow({
      assignee_profile_id: null,
      estimate_work_id: "work-99",
      start_at: null,
      due_at: null,
    }));

    expect(task).toEqual({
      id: "task-1",
      project_id: "project-1",
      stage_id: "stage-1",
      title: "Install outlets",
      description: "Wire and install outlets",
      status: "in_progress",
      assignee_id: "",
      checklist: [],
      comments: [],
      attachments: [],
      photos: [],
      linked_estimate_item_ids: [],
      created_at: "2026-03-01T00:00:00.000Z",
      estimateV2WorkId: "work-99",
      startDate: undefined,
      deadline: undefined,
    });
  });
});
