import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapProjectStageRowToStage,
  mapTaskRowToTask,
  syncProjectTasksFromEstimate,
} from "@/data/planning-source";

type MockSupabaseClient = {
  from: (table: string) => unknown;
};

let mockSupabase: MockSupabaseClient | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

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
  afterEach(() => {
    mockSupabase = null;
  });

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

  it("deletes stale estimate-linked checklist rows before reusing sort order", async () => {
    const operations: string[] = [];
    const deletedChecklistIds: string[] = [];

    mockSupabase = {
      from(table: string) {
        if (table === "tasks") {
          return {
            select() {
              return {
                eq() {
                  return Promise.resolve({
                    data: [taskRow()],
                    error: null,
                  });
                },
              };
            },
            upsert(rows: unknown[]) {
              operations.push(`tasks.upsert:${rows.length}`);
              return Promise.resolve({ error: null });
            },
            update() {
              return {
                in() {
                  operations.push("tasks.clear");
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }

        if (table === "task_checklist_items") {
          return {
            select() {
              return {
                in() {
                  return Promise.resolve({
                    data: [
                      {
                        id: "check-stale",
                        task_id: "task-1",
                        title: "Old line",
                        is_done: false,
                        procurement_item_id: null,
                        estimate_resource_line_id: "line-old",
                        estimate_work_id: "work-1",
                        sort_order: 1,
                        created_at: "2026-03-01T00:00:00.000Z",
                        updated_at: "2026-03-01T00:00:00.000Z",
                      },
                      {
                        id: "check-keep",
                        task_id: "task-1",
                        title: "Keep line",
                        is_done: true,
                        procurement_item_id: null,
                        estimate_resource_line_id: "line-keep",
                        estimate_work_id: "work-1",
                        sort_order: 2,
                        created_at: "2026-03-01T00:00:00.000Z",
                        updated_at: "2026-03-01T00:00:00.000Z",
                      },
                    ],
                    error: null,
                  });
                },
              };
            },
            delete() {
              return {
                in(_: string, ids: string[]) {
                  operations.push(`checklist.delete:${ids.join(",")}`);
                  deletedChecklistIds.push(...ids);
                  return Promise.resolve({ error: null });
                },
              };
            },
            upsert(rows: Array<{ id: string; sort_order: number }>) {
              operations.push(`checklist.upsert:${rows.map((row) => `${row.id}:${row.sort_order}`).join(",")}`);
              const reusedSortOrder = rows.some((row) => row.id === "check-keep" && row.sort_order === 1);
              if (reusedSortOrder && !deletedChecklistIds.includes("check-stale")) {
                return Promise.resolve({
                  error: {
                    message:
                      'duplicate key value violates unique constraint "task_checklist_items_task_id_sort_order_key"',
                  },
                });
              }
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await syncProjectTasksFromEstimate({
      projectId: "project-1",
      estimateStatus: "in_work",
      works: [
        {
          id: "work-1",
          stageId: "stage-1",
          taskId: "task-1",
          title: "Install outlets",
          plannedStart: null,
          plannedEnd: null,
        },
      ],
      lines: [
        {
          id: "line-keep",
          workId: "work-1",
          title: "Updated line",
          type: "tool",
        },
      ],
      profileId: "profile-1",
    });

    expect(result).toEqual({ "work-1": "task-1" });
    expect(operations).toEqual([
      "tasks.upsert:1",
      "checklist.delete:check-stale",
      "checklist.upsert:check-keep:1",
    ]);
  });
});
