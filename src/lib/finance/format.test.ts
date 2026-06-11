import { describe, expect, it } from "vitest";
import { formatPct, formatSignedPct } from "@/lib/finance/format";

describe("formatPct", () => {
  it("renders an em dash for null and non-finite values", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
    expect(formatPct(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formats with the requested precision", () => {
    expect(formatPct(5.86, 1)).toBe("5,9%");
    expect(formatPct(56.46, 0)).toBe("56%");
  });
});

describe("formatSignedPct", () => {
  it("signs from the rounded value, never a signed zero", () => {
    expect(formatSignedPct(0.4, 0)).toBe("0%");
    expect(formatSignedPct(-0.4, 0)).toBe("0%");
    expect(formatSignedPct(0, 0)).toBe("0%");
  });

  it("keeps explicit signs for non-zero rounded deltas", () => {
    expect(formatSignedPct(12.9, 0)).toBe("+13%");
    expect(formatSignedPct(-5.2, 0)).toBe("-5%");
  });

  it("renders an em dash for null", () => {
    expect(formatSignedPct(null)).toBe("—");
  });
});
