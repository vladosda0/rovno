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

function checklistRow(
  overrides: Partial<{
    id: string;
    task_id: string;
    title: string;
    is_done: boolean;
    procurement_item_id: string | null;
    estimate_resource_line_id: string | null;
    estimate_work_id: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }> = {},
) {
  return {
    id: "check-1",
    task_id: "task-1",
    title: "Checklist item",
    is_done: false,
    procurement_item_id: null,
    estimate_resource_line_id: null,
    estimate_work_id: null,
    sort_order: 1,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function createTaskSyncSupabaseMock(input: {
  operations: string[];
  taskRows?: Array<ReturnType<typeof taskRow>>;
  checklistRows?: Array<ReturnType<typeof checklistRow>>;
}) {
  const state = {
    taskRows: input.taskRows ?? [taskRow()],
    checklistRows: [...(input.checklistRows ?? [])],
  };
  const duplicateKeyError = {
    message:
      'duplicate key value violates unique constraint "task_checklist_items_task_id_sort_order_key"',
  };

  const client: MockSupabaseClient = {
    from(table: string) {
      if (table === "tasks") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({
                  data: state.taskRows,
                  error: null,
                });
              },
            };
          },
          upsert(rows: unknown[]) {
            input.operations.push(`tasks.upsert:${rows.length}`);
            return Promise.resolve({ error: null });
          },
          update() {
            return {
              in() {
                input.operations.push("tasks.clear");
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
              in(_: string, ids: string[]) {
                return Promise.resolve({
                  data: state.checklistRows.filter((row) => ids.includes(row.task_id)),
                  error: null,
                });
              },
            };
          },
          delete() {
            return {
              in(_: string, ids: string[]) {
                input.operations.push(`checklist.delete:${ids.join(",")}`);
                state.checklistRows = state.checklistRows.filter((row) => !ids.includes(row.id));
                return Promise.resolve({ error: null });
              },
            };
          },
          update(patch: { sort_order?: number }) {
            let rowId: string | null = null;
            let taskId: string | null = null;

            const applyUpdate = () => {
              if (!rowId || !taskId) {
                return null;
              }

              const row = state.checklistRows.find((entry) => entry.id === rowId && entry.task_id === taskId);
              if (!row) {
                return Promise.resolve({ error: new Error(`Missing checklist row ${rowId}`) });
              }

              if (patch.sort_order !== undefined) {
                input.operations.push(`checklist.reorder:${rowId}:${patch.sort_order}`);
                row.sort_order = patch.sort_order;
              }

              return Promise.resolve({ error: null });
            };

            const chain = {
              eq(field: string, value: string) {
                if (field === "id") rowId = value;
                if (field === "task_id") taskId = value;
                return applyUpdate() ?? chain;
              },
            };

            return chain;
          },
          upsert(rows: Array<{
            id: string;
            task_id: string;
            title: string;
            is_done: boolean;
            procurement_item_id: string | null;
            estimate_resource_line_id: string | null;
            estimate_work_id: string | null;
            sort_order: number;
          }>) {
            input.operations.push(`checklist.upsert:${rows.map((row) => `${row.id}:${row.sort_order}`).join(",")}`);

            for (const row of rows) {
              const conflictingRow = state.checklistRows.find((existingRow) => (
                existingRow.task_id === row.task_id
                && existingRow.sort_order === row.sort_order
                && existingRow.id !== row.id
              ));
              if (conflictingRow) {
                return Promise.resolve({ error: duplicateKeyError });
              }

              const existingIndex = state.checklistRows.findIndex((existingRow) => existingRow.id === row.id);
              if (existingIndex >= 0) {
                state.checklistRows[existingIndex] = {
                  ...state.checklistRows[existingIndex],
                  ...row,
                };
                continue;
              }

              state.checklistRows.push(checklistRow({
                ...row,
              }));
            }

            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return {
    client,
    state,
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
    const { client, state } = createTaskSyncSupabaseMock({
      operations,
      checklistRows: [
        checklistRow({
          id: "check-stale",
          title: "Old line",
          estimate_resource_line_id: "line-old",
          estimate_work_id: "work-1",
          sort_order: 1,
        }),
        checklistRow({
          id: "check-keep",
          title: "Keep line",
          is_done: true,
          estimate_resource_line_id: "line-keep",
          estimate_work_id: "work-1",
          sort_order: 2,
        }),
      ],
    });

    mockSupabase = client;

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
      "checklist.reorder:check-keep:4",
      "checklist.upsert:check-keep:1",
    ]);
    expect(state.checklistRows).toEqual([
      expect.objectContaining({
        id: "check-keep",
        title: "Updated line",
        estimate_resource_line_id: "line-keep",
        estimate_work_id: "work-1",
        sort_order: 1,
      }),
    ]);
  });

  it("moves manual checklist rows behind estimate-linked rows during Supabase sync", async () => {
    const operations: string[] = [];
    const { client, state } = createTaskSyncSupabaseMock({
      operations,
      checklistRows: [
        checklistRow({
          id: "check-manual",
          title: "Manual follow-up",
          is_done: true,
          sort_order: 1,
        }),
        checklistRow({
          id: "check-line-material",
          title: "Old material line",
          estimate_resource_line_id: "line-material",
          estimate_work_id: "work-1",
          sort_order: 2,
        }),
        checklistRow({
          id: "check-line-tool",
          title: "Old tool line",
          estimate_resource_line_id: "line-tool",
          estimate_work_id: "work-1",
          sort_order: 3,
        }),
      ],
    });

    mockSupabase = client;

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
          id: "line-material",
          workId: "work-1",
          title: "Material line",
          type: "material",
        },
        {
          id: "line-tool",
          workId: "work-1",
          title: "Tool line",
          type: "tool",
        },
      ],
      profileId: "profile-1",
    });

    expect(result).toEqual({ "work-1": "task-1" });
    expect(operations).toEqual([
      "tasks.upsert:1",
      "checklist.reorder:check-manual:6",
      "checklist.reorder:check-line-material:7",
      "checklist.reorder:check-line-tool:8",
      "checklist.upsert:check-line-material:1,check-line-tool:2",
      "checklist.reorder:check-manual:3",
    ]);
    expect(
      [...state.checklistRows].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    ).toEqual([
      expect.objectContaining({
        id: "check-line-material",
        title: "Material line",
        estimate_resource_line_id: "line-material",
        estimate_work_id: "work-1",
        sort_order: 1,
      }),
      expect.objectContaining({
        id: "check-line-tool",
        title: "Tool line",
        estimate_resource_line_id: "line-tool",
        estimate_work_id: "work-1",
        sort_order: 2,
      }),
      expect.objectContaining({
        id: "check-manual",
        title: "Manual follow-up",
        is_done: true,
        estimate_resource_line_id: null,
        estimate_work_id: null,
        sort_order: 3,
      }),
    ]);
  });
});
