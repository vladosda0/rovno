import { describe, expect, it } from "vitest";
import { deriveSubscriptionStatus, formatRubFromKopecks, newIdempotencyKey } from "@/lib/billing";

describe("newIdempotencyKey", () => {
  it("returns a UUID via crypto.randomUUID when available", () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("falls back to a valid UUID v4 shape when crypto.randomUUID is unavailable", () => {
    const original = globalThis.crypto;
    // Simulate a non-secure context where randomUUID is missing.
    Object.defineProperty(globalThis, "crypto", {
      value: { ...original, randomUUID: undefined },
      configurable: true,
    });
    try {
      expect(newIdempotencyKey()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});

describe("formatRubFromKopecks", () => {
  it("converts kopecks to whole rubles with the currency sign", () => {
    expect(formatRubFromKopecks(99000)).toBe("990 ₽");
    expect(formatRubFromKopecks(0)).toBe("0 ₽");
  });
});

describe("deriveSubscriptionStatus", () => {
  const now = Date.parse("2026-05-20T00:00:00Z");

  it("returns none when there is no subscription", () => {
    expect(deriveSubscriptionStatus(null, now)).toEqual({ status: "none", readOnly: false });
  });

  it("is active before the period ends", () => {
    expect(
      deriveSubscriptionStatus({ current_period_ends_at: "2026-06-20T00:00:00Z" }, now),
    ).toEqual({ status: "active", readOnly: false });
  });

  it("is in grace within 7 days after the period ends", () => {
    expect(
      deriveSubscriptionStatus({ current_period_ends_at: "2026-05-18T00:00:00Z" }, now),
    ).toEqual({ status: "grace", readOnly: false });
  });

  it("is expired and read-only past the 7-day grace window", () => {
    expect(
      deriveSubscriptionStatus({ current_period_ends_at: "2026-05-01T00:00:00Z" }, now),
    ).toEqual({ status: "expired", readOnly: true });
  });

  it("treats a current subscription with no period end as active", () => {
    expect(deriveSubscriptionStatus({ current_period_ends_at: null }, now)).toEqual({
      status: "active",
      readOnly: false,
    });
  });
});
