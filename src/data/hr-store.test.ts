import { beforeEach, describe, expect, it } from "vitest";
import {
  __unsafeResetHrForTests,
  addPayment,
  createFromEstimateLine,
  getHRItems,
  HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE,
  relinkToEstimateLine,
  setHRAssignees,
  setStatus,
  syncHRFromEstimateV2,
  updateFromEstimateLine,
} from "@/data/hr-store";
import type { EstimateV2ResourceLine } from "@/types/estimate-v2";

function line(partial: Partial<EstimateV2ResourceLine>): EstimateV2ResourceLine {
  return {
    id: partial.id ?? "line-1",
    projectId: partial.projectId ?? "project-1",
    stageId: partial.stageId ?? "stage-1",
    workId: partial.workId ?? "work-1",
    title: partial.title ?? "Painter",
    type: partial.type ?? "labor",
    unit: partial.unit ?? "hour",
    qtyMilli: partial.qtyMilli ?? 10_000,
    costUnitCents: partial.costUnitCents ?? 2_000,
    markupBps: 0,
    discountBpsOverride: null,
    assigneeId: partial.assigneeId ?? null,
    assigneeName: partial.assigneeName ?? null,
    assigneeEmail: partial.assigneeEmail ?? null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("hr-store", () => {
  beforeEach(() => {
    __unsafeResetHrForTests();
  });

  it("creates and updates estimate-linked HR items", () => {
    const projectId = `hr-create-${Date.now()}`;
    const created = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Electrician",
      type: "labor",
      plannedQty: 8,
      plannedRate: 100,
    });

    expect(created.lockedFromEstimate).toBe(true);
    expect(created.sourceEstimateV2LineId).toBe("line-1");
    expect(created.assigneeIds).toEqual([]);

    updateFromEstimateLine(projectId, created.id, {
      title: "Electrician lead",
      plannedQty: 12,
      plannedRate: 150,
      type: "subcontractor",
      lineId: "line-1",
    });

    const updated = getHRItems(projectId)[0];
    expect(updated.title).toBe("Electrician lead");
    expect(updated.plannedQty).toBe(12);
    expect(updated.plannedRate).toBe(150);
    expect(updated.type).toBe("subcontractor");
    expect(updated.lockedFromEstimate).toBe(true);
  });

  it("tracks payments without changing work status", () => {
    const projectId = `hr-pay-${Date.now()}`;
    const created = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Crew",
      type: "labor",
      plannedQty: 2,
      plannedRate: 100,
    });

    const blocked = setStatus(created.id, "in_progress");
    expect(blocked.ok).toBe(false);

    updateFromEstimateLine(projectId, created.id, {
      assignee: "user-2",
      lineId: "line-1",
    });
    const changed = setStatus(created.id, "in_progress");
    expect(changed.ok).toBe(true);

    addPayment(created.id, 50, "2026-01-01T00:00:00.000Z");
    addPayment(created.id, 200, "2026-01-02T00:00:00.000Z");

    const afterPayments = getHRItems(projectId)[0];
    expect(afterPayments.status).toBe("in_progress");
  });

  it("enforces C2: in_progress/done require at least one assignee", () => {
    const projectId = `hr-c2-${Date.now()}`;
    const created = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Crew",
      type: "labor",
      plannedQty: 1,
      plannedRate: 100,
    });

    const blockedStart = setStatus(created.id, "in_progress");
    expect(blockedStart.ok).toBe(false);
    expect(blockedStart.error).toContain("Assign at least one person");

    const blockedDone = setStatus(created.id, "done");
    expect(blockedDone.ok).toBe(false);

    const blockedAssign = setHRAssignees(projectId, created.id, ["user-2", "user-3"]);
    expect(blockedAssign.ok).toBe(false);
    expect(blockedAssign.error).toBe(HR_ASSIGNEE_MANAGED_IN_ESTIMATE_MESSAGE);

    updateFromEstimateLine(projectId, created.id, {
      assignee: "user-2",
      lineId: "line-1",
    });

    const allowedStart = setStatus(created.id, "in_progress");
    expect(allowedStart.ok).toBe(true);

    const allowedDone = setStatus(created.id, "done");
    expect(allowedDone.ok).toBe(true);
  });

  it("applies orphan policy for delete/cross-family and keeps intra-family linkage", () => {
    const projectId = `hr-orphan-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "labor" })],
    });

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "subcontractor" })],
    });

    const intraFamily = getHRItems(projectId)[0];
    expect(intraFamily.orphaned).toBe(false);
    expect(intraFamily.type).toBe("subcontractor");

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, type: "material" })],
    });

    const crossFamily = getHRItems(projectId)[0];
    expect(crossFamily.orphaned).toBe(true);
    expect(crossFamily.orphanedReason).toBe("estimate_line_type_changed");
    expect(crossFamily.sourceEstimateV2LineId).toBeNull();

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [],
    });

    const deleted = getHRItems(projectId)[0];
    expect(deleted.orphaned).toBe(true);
  });

  it("prevents relinking two HR items to the same estimate line", () => {
    const projectId = `hr-relink-conflict-${Date.now()}`;
    const first = createFromEstimateLine(projectId, "line-1", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Crew A",
      type: "labor",
      plannedQty: 1,
      plannedRate: 100,
    });
    const second = createFromEstimateLine(projectId, "line-2", {
      stageId: "stage-1",
      workId: "work-1",
      title: "Crew B",
      type: "labor",
      plannedQty: 1,
      plannedRate: 100,
    });

    const relink = relinkToEstimateLine(second.id, "line-1");
    expect(relink.ok).toBe(false);

    const unchanged = getHRItems(projectId).find((item) => item.id === second.id);
    expect(unchanged?.sourceEstimateV2LineId).toBe("line-2");

    const unaffectedFirst = getHRItems(projectId).find((item) => item.id === first.id);
    expect(unaffectedFirst?.sourceEstimateV2LineId).toBe("line-1");
  });

  it("preserves assigneeIds across estimate sync updates", () => {
    const projectId = `hr-assignees-sync-${Date.now()}`;
    const lineId = `line-${Date.now()}`;

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({ id: lineId, projectId, title: "Crew", assigneeId: "user-2" })],
    });

    const created = getHRItems(projectId)[0];
    expect(created.assigneeIds).toEqual(["user-2"]);

    syncHRFromEstimateV2(projectId, {
      project: { estimateStatus: "in_work" },
      lines: [line({
        id: lineId,
        projectId,
        title: "Crew updated",
        qtyMilli: 15_000,
        assigneeId: "user-2",
      })],
    });

    const updated = getHRItems(projectId)[0];
    expect(updated.title).toBe("Crew updated");
    expect(updated.assigneeIds).toEqual(["user-2"]);
  });
});
