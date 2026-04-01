import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  existingHRRows: [] as Array<{
    id: string;
    estimate_resource_line_id: string | null;
    estimate_work_id: string | null;
    task_id: string | null;
    title: string;
    description: string | null;
    compensation_type: "hourly" | "daily" | "fixed";
    planned_cost_cents: number | null;
    actual_cost_cents: number | null;
    status: "planned" | "in_progress" | "completed" | "cancelled";
    start_at: string | null;
    end_at: string | null;
    created_by: string;
  }>,
  assigneeRowsByItemId: {} as Record<string, Array<{ id: string; profile_id: string }>>,
  bulkAssigneeRows: [] as Array<{ hr_item_id: string; profile_id: string }>,
  upsertHRItemsMock: vi.fn(),
  insertAssigneesMock: vi.fn(),
  deleteAssigneesMock: vi.fn(),
  loadEstimateV2HeroTransitionCacheMock: vi.fn(),
  getLatestHeroTransitionEventMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table === "hr_items") {
        return {
          select(selection: string) {
            if (selection === "id, created_by") {
              return {
                in(_field: string, _ids: string[]) {
                  return Promise.resolve({
                    data: state.existingHRRows.map((row) => ({
                      id: row.id,
                      created_by: row.created_by,
                    })),
                    error: null,
                  });
                },
              };
            }

            if (selection === "id, estimate_work_id, task_id, title, description, compensation_type, planned_cost_cents, actual_cost_cents, status, start_at, end_at, created_by") {
              return {
                eq(_field: string, _projectId: string) {
                  return Promise.resolve({
                    data: state.existingHRRows.map((row) => ({
                      id: row.id,
                      estimate_work_id: row.estimate_work_id,
                      task_id: row.task_id,
                      title: row.title,
                      description: row.description,
                      compensation_type: row.compensation_type,
                      planned_cost_cents: row.planned_cost_cents,
                      actual_cost_cents: row.actual_cost_cents,
                      status: row.status,
                      start_at: row.start_at,
                      end_at: row.end_at,
                      created_by: row.created_by,
                    })),
                    error: null,
                  });
                },
              };
            }

            if (selection === "id, estimate_resource_line_id, estimate_work_id, task_id, title, description, compensation_type, planned_cost_cents, actual_cost_cents, status, start_at, end_at, created_by") {
              return {
                eq(_field: string, _projectId: string) {
                  return Promise.resolve({
                    data: state.existingHRRows,
                    error: null,
                  });
                },
              };
            }

            if (selection === "id, estimate_resource_line_id") {
              return {
                eq(_field: string, _projectId: string) {
                  return Promise.resolve({
                    data: state.existingHRRows.map((row) => ({
                      id: row.id,
                      estimate_resource_line_id: row.estimate_resource_line_id,
                    })),
                    error: null,
                  });
                },
              };
            }

            if (selection === "id") {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { id: "hr-item-1" },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            }

            throw new Error(`Unexpected hr_items select: ${selection}`);
          },
          upsert(rows: unknown, options: unknown) {
            state.upsertHRItemsMock(rows, options);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "hr_item_assignees") {
        return {
          select(selection: string) {
            if (selection === "hr_item_id, profile_id") {
              return {
                in(_field: string, _ids: string[]) {
                  return Promise.resolve({
                    data: state.bulkAssigneeRows,
                    error: null,
                  });
                },
              };
            }

            if (selection === "id, profile_id") {
              return {
                eq(_field: string, hrItemId: string) {
                  return Promise.resolve({
                    data: state.assigneeRowsByItemId[hrItemId] ?? [],
                    error: null,
                  });
                },
              };
            }

            throw new Error(`Unexpected hr_item_assignees select: ${selection}`);
          },
          insert(rows: unknown) {
            state.insertAssigneesMock(rows);
            return Promise.resolve({ error: null });
          },
          delete() {
            return {
              in(field: string, ids: string[]) {
                state.deleteAssigneesMock(field, ids);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

vi.mock("@/data/estimate-v2-transition-cache", () => ({
  loadEstimateV2HeroTransitionCache: state.loadEstimateV2HeroTransitionCacheMock,
}));

vi.mock("@/data/activity-source", () => ({
  getLatestHeroTransitionEvent: state.getLatestHeroTransitionEventMock,
}));

import {
  hrStatusRequiresAssignee,
  mapHRItemStatusToRemoteStatus,
  mapHRPaymentRowToHRPayment,
  shapeHRItemsWithAssignees,
  syncProjectHRFromEstimate,
} from "@/data/hr-source";

function hrItemRow(
  overrides: Partial<Parameters<typeof shapeHRItemsWithAssignees>[0]["itemRows"][number]> = {},
) {
  return {
    id: "hr-item-1",
    project_id: "project-1",
    project_stage_id: "stage-1",
    estimate_resource_line_id: null,
    estimate_work_id: "work-1",
    task_id: "task-1",
    title: "Electrical crew",
    description: "Crew for rough-in",
    compensation_type: "fixed" as const,
    planned_cost_cents: 125000,
    actual_cost_cents: 0,
    status: "completed" as const,
    start_at: null,
    end_at: null,
    created_by: "profile-1",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    ...overrides,
  };
}

function hrItemAssigneeRow(
  overrides: Partial<Parameters<typeof shapeHRItemsWithAssignees>[0]["assigneeRows"][number]> = {},
) {
  return {
    id: "assign-1",
    hr_item_id: "hr-item-1",
    profile_id: "profile-2",
    role_label: null,
    created_at: "2026-03-01T01:00:00.000Z",
    ...overrides,
  };
}

function hrPaymentRow(
  overrides: Partial<Parameters<typeof mapHRPaymentRowToHRPayment>[0]> = {},
) {
  return {
    id: "payment-1",
    project_id: "project-1",
    hr_item_id: "hr-item-1",
    paid_to_profile_id: "profile-2",
    amount_cents: 105050,
    status: "paid" as const,
    paid_at: "2026-03-03T00:00:00.000Z",
    notes: "Transferred",
    created_by: "profile-1",
    created_at: "2026-03-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("hr-source helpers", () => {
  beforeEach(() => {
    state.existingHRRows = [];
    state.assigneeRowsByItemId = {};
    state.bulkAssigneeRows = [];
    state.upsertHRItemsMock.mockReset();
    state.insertAssigneesMock.mockReset();
    state.deleteAssigneesMock.mockReset();
    state.loadEstimateV2HeroTransitionCacheMock.mockReset();
    state.getLatestHeroTransitionEventMock.mockReset();
    state.loadEstimateV2HeroTransitionCacheMock.mockReturnValue(null);
    state.getLatestHeroTransitionEventMock.mockResolvedValue(null);
  });

  it("maps supported frontend HR statuses to backend rows and rejects blocked", () => {
    expect(mapHRItemStatusToRemoteStatus("planned")).toBe("planned");
    expect(mapHRItemStatusToRemoteStatus("in_progress")).toBe("in_progress");
    expect(mapHRItemStatusToRemoteStatus("done")).toBe("completed");
    expect(mapHRItemStatusToRemoteStatus("cancelled")).toBe("cancelled");
    expect(() => mapHRItemStatusToRemoteStatus("blocked")).toThrow(
      "Blocked status is not yet supported in Supabase mode.",
    );
  });

  it("requires an assignee only for active or completed HR work", () => {
    expect(hrStatusRequiresAssignee("planned")).toBe(false);
    expect(hrStatusRequiresAssignee("blocked")).toBe(false);
    expect(hrStatusRequiresAssignee("cancelled")).toBe(false);
    expect(hrStatusRequiresAssignee("in_progress")).toBe(true);
    expect(hrStatusRequiresAssignee("done")).toBe(true);
  });

  it("shapes HR items with planned totals, task ids, and recovered estimate linkage", () => {
    const items = shapeHRItemsWithAssignees({
      itemRows: [
        hrItemRow({
          project_stage_id: null,
          estimate_work_id: null,
        }),
      ],
      assigneeRows: [
        hrItemAssigneeRow({
          profile_id: "profile-3",
        }),
        hrItemAssigneeRow({
          id: "assign-2",
          profile_id: "profile-2",
          created_at: "2026-03-01T02:00:00.000Z",
        }),
        hrItemAssigneeRow({
          id: "assign-3",
          profile_id: "profile-3",
          created_at: "2026-03-01T03:00:00.000Z",
        }),
      ],
      estimateLineIdByItemId: new Map([["hr-item-1", "estimate-line-1"]]),
    });

    expect(items).toEqual([
      {
        id: "hr-item-1",
        projectId: "project-1",
        stageId: "",
        workId: "",
        taskId: "task-1",
        title: "Electrical crew",
        type: "labor",
        plannedQty: 1,
        plannedRate: 1250,
        assignee: "profile-3",
        assigneeIds: ["profile-3", "profile-2"],
        status: "done",
        lockedFromEstimate: false,
        sourceEstimateV2LineId: "estimate-line-1",
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    ]);
  });

  it("prefers backend estimate line lineage over fallback cache recovery", () => {
    const items = shapeHRItemsWithAssignees({
      itemRows: [
        hrItemRow({
          estimate_resource_line_id: "estimate-line-backend",
          estimate_work_id: null,
        }),
      ],
      assigneeRows: [],
      estimateLineIdByItemId: new Map([["hr-item-1", "estimate-line-fallback"]]),
    });

    expect(items).toEqual([
      expect.objectContaining({
        lockedFromEstimate: true,
        sourceEstimateV2LineId: "estimate-line-backend",
      }),
    ]);
  });

  it("maps HR payments into the frontend contract with safe fallbacks", () => {
    const payment = mapHRPaymentRowToHRPayment(hrPaymentRow({
      hr_item_id: null,
      paid_at: null,
      notes: null,
    }));

    expect(payment).toEqual({
      id: "payment-1",
      projectId: "project-1",
      hrItemId: "",
      amount: 1050.5,
      paidAt: "2026-03-02T00:00:00.000Z",
      note: null,
      createdAt: "2026-03-02T00:00:00.000Z",
    });
  });

  it("syncs estimate-driven HR rows through existing lineage and only seeds real participant assignees", async () => {
    state.loadEstimateV2HeroTransitionCacheMock.mockReturnValue({
      version: 1,
      projectId: "project-1",
      fingerprint: "fingerprint-1",
      status: "completed",
      updatedAt: "2026-03-05T00:00:00.000Z",
      ids: {
        estimateId: "estimate-1",
        versionId: "version-1",
        eventId: "event-1",
        stageIdByLocalStageId: {},
        workIdByLocalWorkId: {},
        lineIdByLocalLineId: {
          "line-local-1": "line-1",
          "line-local-2": "line-2",
        },
        taskIdByLocalWorkId: {},
        checklistItemIdByLocalLineId: {},
        procurementItemIdByLocalLineId: {},
        hrItemIdByLocalLineId: {
          "line-local-1": "hr-item-1",
          "line-local-2": "hr-item-2",
        },
      },
    });
    state.existingHRRows = [
      {
        id: "hr-item-1",
        estimate_resource_line_id: null,
        estimate_work_id: "work-1",
        task_id: "task-1",
        title: "Crew hours",
        description: null,
        compensation_type: "fixed",
        planned_cost_cents: 300000,
        actual_cost_cents: null,
        status: "planned",
        start_at: "2026-03-10T00:00:00.000Z",
        end_at: "2026-03-11T00:00:00.000Z",
        created_by: "creator-1",
      },
      {
        id: "hr-item-2",
        estimate_resource_line_id: null,
        estimate_work_id: "work-1",
        task_id: "task-1",
        title: "Scaffold team",
        description: null,
        compensation_type: "fixed",
        planned_cost_cents: 90000,
        actual_cost_cents: null,
        status: "planned",
        start_at: "2026-03-10T00:00:00.000Z",
        end_at: "2026-03-11T00:00:00.000Z",
        created_by: "creator-2",
      },
    ];
    state.bulkAssigneeRows = [];
    state.assigneeRowsByItemId = {
      "hr-item-1": [],
      "hr-item-2": [],
    };

    await syncProjectHRFromEstimate(
      { kind: "supabase", profileId: "profile-9" },
      {
        projectId: "project-1",
        estimateStatus: "in_work",
        works: [
          {
            id: "work-1",
            taskId: "task-1",
            plannedStart: "2026-03-10T00:00:00.000Z",
            plannedEnd: "2026-03-11T00:00:00.000Z",
          },
        ],
        lines: [
          {
            id: "line-1",
            stageId: "stage-1",
            workId: "work-1",
            title: "Crew hours",
            type: "labor",
            qtyMilli: 2000,
            costUnitCents: 150000,
            assigneeId: "profile-7",
          },
          {
            id: "line-2",
            stageId: "stage-1",
            workId: "work-1",
            title: "Scaffold team",
            type: "subcontractor",
            qtyMilli: 1000,
            costUnitCents: 90000,
            assigneeId: null,
          },
        ],
      },
    );

    expect(state.upsertHRItemsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hr-item-1",
          project_id: "project-1",
          project_stage_id: "stage-1",
          estimate_resource_line_id: "line-1",
          estimate_work_id: "work-1",
          task_id: "task-1",
          title: "Crew hours",
          planned_cost_cents: 300000,
          status: "planned",
          created_by: "creator-1",
        }),
        expect.objectContaining({
          id: "hr-item-2",
          estimate_resource_line_id: "line-2",
          title: "Scaffold team",
          planned_cost_cents: 90000,
          status: "planned",
          created_by: "creator-2",
        }),
      ]),
      { onConflict: "id" },
    );
    expect(state.insertAssigneesMock).toHaveBeenCalledWith([
      {
        hr_item_id: "hr-item-1",
        profile_id: "profile-7",
        role_label: null,
      },
    ]);
    expect(state.deleteAssigneesMock).not.toHaveBeenCalled();
  });

  it("defaults new estimate-driven HR rows to planned status", async () => {
    await syncProjectHRFromEstimate(
      { kind: "supabase", profileId: "profile-9" },
      {
        projectId: "project-1",
        estimateStatus: "in_work",
        works: [
          {
            id: "work-1",
            taskId: "task-1",
            plannedStart: "2026-03-10T00:00:00.000Z",
            plannedEnd: "2026-03-11T00:00:00.000Z",
          },
        ],
        lines: [
          {
            id: "line-1",
            stageId: "stage-1",
            workId: "work-1",
            title: "Fresh labor row",
            type: "labor",
            qtyMilli: 2000,
            costUnitCents: 150000,
            assigneeId: null,
          },
        ],
      },
    );

    expect(state.upsertHRItemsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "line-1",
          project_id: "project-1",
          project_stage_id: "stage-1",
          estimate_resource_line_id: "line-1",
          estimate_work_id: "work-1",
          task_id: "task-1",
          title: "Fresh labor row",
          planned_cost_cents: 300000,
          status: "planned",
          created_by: "profile-9",
        }),
      ],
      { onConflict: "id" },
    );
    expect(state.insertAssigneesMock).not.toHaveBeenCalled();
    expect(state.deleteAssigneesMock).not.toHaveBeenCalled();
  });
});
