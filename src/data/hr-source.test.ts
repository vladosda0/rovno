import { describe, expect, it } from "vitest";
import {
  mapHRPaymentRowToHRPayment,
  shapeHRItemsWithAssignees,
} from "@/data/hr-source";

function hrItemRow(
  overrides: Partial<Parameters<typeof shapeHRItemsWithAssignees>[0]["itemRows"][number]> = {},
) {
  return {
    id: "hr-item-1",
    project_id: "project-1",
    project_stage_id: "stage-1",
    estimate_work_id: "work-1",
    task_id: null,
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
  it("shapes HR items with grouped assignees and conservative compatibility defaults", () => {
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
    });

    expect(items).toEqual([
      {
        id: "hr-item-1",
        projectId: "project-1",
        stageId: "",
        workId: "",
        title: "Electrical crew",
        type: "labor",
        plannedQty: 0,
        plannedRate: 0,
        assignee: "profile-3",
        assigneeIds: ["profile-3", "profile-2"],
        status: "done",
        lockedFromEstimate: false,
        sourceEstimateV2LineId: null,
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
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
});
