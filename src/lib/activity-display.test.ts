import { describe, expect, it } from "vitest";
import { getActivityDisplayDetail } from "@/lib/activity-display";
import type { Event } from "@/types/entities";

function makeEvent(partial: Partial<Event> & Pick<Event, "type" | "payload">): Event {
  return {
    id: "e1",
    project_id: "p1",
    actor_id: "u1",
    object_type: "estimate_version",
    object_id: "o1",
    timestamp: new Date().toISOString(),
    ...partial,
  } as Event;
}

describe("getActivityDisplayDetail", () => {
  it("shows payload text when finance detail is allowed", () => {
    const evt = makeEvent({
      type: "estimate.tax_changed",
      payload: { title: "VAT 20%" },
    });
    expect(getActivityDisplayDetail(evt, { canViewFinanceDetail: true })).toBe("VAT 20%");
  });

  it("redacts estimate payload when finance detail is not allowed", () => {
    const evt = makeEvent({
      type: "estimate.tax_changed",
      payload: { title: "VAT 20%" },
    });
    expect(getActivityDisplayDetail(evt, { canViewFinanceDetail: false })).toBeNull();
  });

  it("redacts procurement payload when finance detail is not allowed", () => {
    const evt = makeEvent({
      type: "procurement_created",
      payload: { name: "Drywall order" },
    });
    expect(getActivityDisplayDetail(evt, { canViewFinanceDetail: false })).toBeNull();
  });

  it("allows non-finance event text without detail", () => {
    const evt = makeEvent({
      type: "task_created",
      payload: { title: "Install cabinets" },
    });
    expect(getActivityDisplayDetail(evt, { canViewFinanceDetail: false })).toBe("Install cabinets");
  });

  it("redacts when payload keys look money-related", () => {
    const evt = makeEvent({
      type: "comment_added",
      payload: { text: "note", line_total_cents: 100 },
    });
    expect(getActivityDisplayDetail(evt, { canViewFinanceDetail: false })).toBeNull();
  });
});
