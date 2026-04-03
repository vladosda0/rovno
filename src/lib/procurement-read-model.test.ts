import { describe, expect, it } from "vitest";
import {
  applySensitiveDetailToProcurementReadSnapshot,
  type ProcurementReadSnapshot,
} from "@/lib/procurement-read-model";

const sampleSnapshot: ProcurementReadSnapshot = {
  projects: [
    {
      projectId: "p1",
      projectTitle: "Project One",
      rows: [
        {
          id: "r1",
          projectId: "p1",
          name: "Item A",
          spec: null,
          unit: "pcs",
          requiredQty: 2,
          remainingQty: 2,
          orderedOpenQty: 0,
          inStockQty: 0,
          status: "requested",
          statusQty: 2,
          statusTotal: 10_000,
          plannedUnitPrice: 5000,
          actualUnitPrice: 5000,
          inStockPlannedTotal: 0,
          inStockActualTotal: 0,
        },
      ],
      totalCount: 1,
      requestedCount: 1,
      orderedCount: 0,
      inStockCount: 0,
      requestedTotal: 10_000,
      orderedTotal: 0,
      inStockTotal: 0,
      inStockPlannedTotal: 0,
      inStockActualTotal: 0,
    },
  ],
  totals: {
    totalCount: 1,
    requestedCount: 1,
    orderedCount: 0,
    inStockCount: 0,
    requestedTotal: 10_000,
    orderedTotal: 0,
    inStockTotal: 0,
    inStockPlannedTotal: 0,
    inStockActualTotal: 0,
  },
};

describe("procurement read model", () => {
  it("applySensitiveDetailToProcurementReadSnapshot preserves counts but strips money when blocked", () => {
    const out = applySensitiveDetailToProcurementReadSnapshot(sampleSnapshot, () => false);
    expect(out.totals.totalCount).toBe(1);
    expect(out.totals.requestedTotal).toBe(0);
    expect(out.projects[0].rows[0].monetaryVisible).toBe(false);
    expect(out.projects[0].rows[0].statusTotal).toBe(0);
  });

  it("applySensitiveDetailToProcurementReadSnapshot leaves snapshot unchanged when allowed", () => {
    const out = applySensitiveDetailToProcurementReadSnapshot(sampleSnapshot, () => true);
    expect(out.totals.requestedTotal).toBe(10_000);
    expect(out.projects[0].rows[0].monetaryVisible).toBeUndefined();
  });
});
