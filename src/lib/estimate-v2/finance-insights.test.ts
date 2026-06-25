import { describe, expect, it } from "vitest";
import { computeEac, computeFinishedAccuracy } from "@/lib/estimate-v2/finance-insights";

describe("computeEac", () => {
  const base = { costTotalCents: 437_692_000, spentCents: 247_130_000 };

  it("returns null below the 20% completion guard (spec 8.6)", () => {
    // Берёзки-1: 18% done, 56% spent — EAC would explode, so it must stay hidden.
    expect(computeEac({ ...base, completionPct: 18 })).toBeNull();
    expect(computeEac({ ...base, completionPct: 19.9 })).toBeNull();
  });

  it("returns null without spend, cost, or completion data", () => {
    expect(computeEac({ ...base, completionPct: null })).toBeNull();
    expect(computeEac({ ...base, spentCents: 0, completionPct: 50 })).toBeNull();
    expect(computeEac({ ...base, costTotalCents: 0, completionPct: 50 })).toBeNull();
  });

  it("computes EAC = cost / CPI at or above the guard", () => {
    const result = computeEac({ ...base, completionPct: 50 });
    expect(result).not.toBeNull();
    // earned = cost × 0.5; CPI = earned / spent; EAC = cost / CPI = spent / 0.5
    expect(result!.eacCents).toBe(494_260_000);
    expect(result!.overrunCents).toBe(494_260_000 - 437_692_000);
    expect(result!.cpi).toBeCloseTo(437_692_000 * 0.5 / 247_130_000, 5);
  });

  it("reports projected savings as a negative overrun", () => {
    const result = computeEac({ costTotalCents: 100_000, spentCents: 40_000, completionPct: 50 });
    expect(result!.eacCents).toBe(80_000);
    expect(result!.overrunCents).toBe(-20_000);
  });
});

describe("computeFinishedAccuracy", () => {
  it("computes cost delta, fact margin, margin delta, and duration delta", () => {
    const result = computeFinishedAccuracy({
      costTotalCents: 400_000,
      spentCents: 440_000,
      revenueExVatCents: 500_000,
      plannedMarginPct: 20,
      durationPlannedDays: 30,
      durationEstimatedDays: 36,
    });
    expect(result.costDeltaPct).toBeCloseTo(10, 5);
    expect(result.marginFactPct).toBeCloseTo(12, 5);
    expect(result.marginDeltaPp).toBeCloseTo(-8, 5);
    expect(result.durationFactDays).toBe(36);
    expect(result.durationDeltaDays).toBe(6);
  });

  it("returns nulls on zero denominators and missing inputs", () => {
    const result = computeFinishedAccuracy({
      costTotalCents: 0,
      spentCents: 0,
      revenueExVatCents: 0,
      plannedMarginPct: null,
      durationPlannedDays: null,
      durationEstimatedDays: null,
    });
    expect(result.costDeltaPct).toBeNull();
    expect(result.marginFactPct).toBeNull();
    expect(result.marginDeltaPp).toBeNull();
    expect(result.durationFactDays).toBeNull();
    expect(result.durationDeltaDays).toBeNull();
  });

  it("keeps margin delta null when the planned margin is unknown", () => {
    const result = computeFinishedAccuracy({
      costTotalCents: 100,
      spentCents: 90,
      revenueExVatCents: 120,
      plannedMarginPct: null,
      durationPlannedDays: 10,
      durationEstimatedDays: 10,
    });
    expect(result.marginFactPct).toBeCloseTo(25, 5);
    expect(result.marginDeltaPp).toBeNull();
    expect(result.durationDeltaDays).toBe(0);
  });
});
