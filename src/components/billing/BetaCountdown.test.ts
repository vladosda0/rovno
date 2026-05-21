import { describe, expect, it } from "vitest";
import { getBetaRemaining } from "@/components/billing/BetaCountdown";

describe("getBetaRemaining", () => {
  const now = Date.parse("2026-05-20T00:00:00Z");

  it("returns null once the deadline has passed", () => {
    expect(getBetaRemaining(new Date("2026-05-19T00:00:00Z"), now)).toBeNull();
    expect(getBetaRemaining(new Date("2026-05-20T00:00:00Z"), now)).toBeNull();
  });

  it("computes whole days remaining", () => {
    expect(getBetaRemaining(new Date("2026-06-03T00:00:00Z"), now)).toEqual({ days: 14, hours: 0 });
  });

  it("computes days and hours for urgency under a week", () => {
    expect(getBetaRemaining(new Date("2026-05-22T05:00:00Z"), now)).toEqual({ days: 2, hours: 5 });
  });
});
