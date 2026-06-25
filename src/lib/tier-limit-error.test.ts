import { describe, expect, it } from "vitest";
import { parseTierLimitError, tierLimitPaywallKey } from "@/lib/tier-limit-error";

describe("parseTierLimitError", () => {
  it("parses the structured JSON hint emitted by the triggers", () => {
    const info = parseTierLimitError({
      code: "P0001",
      message: "estimate_limit_exceeded",
      hint: JSON.stringify({
        reason: "tier_limit",
        limit_type: "estimates_total",
        plan_code: "free",
        limit: 1,
        current: 1,
      }),
    });
    expect(info?.limit_type).toBe("estimates_total");
    expect(info?.plan_code).toBe("free");
    expect(info?.limit).toBe(1);
  });

  it("falls back to the exception message when the hint is stripped", () => {
    expect(parseTierLimitError({ message: "project_editor_limit_exceeded" })?.limit_type)
      .toBe("editors_per_project");
    expect(parseTierLimitError({ message: "organization_requires_brigade" })?.limit_type)
      .toBe("can_create_organization");
    expect(parseTierLimitError({ message: "business_card_requires_brigade" })?.limit_type)
      .toBe("can_create_business_card");
  });

  it("returns null for unrelated or non-object errors", () => {
    expect(parseTierLimitError({ message: "duplicate key value violates unique constraint" })).toBeNull();
    expect(parseTierLimitError(null)).toBeNull();
    expect(parseTierLimitError("boom")).toBeNull();
  });

  it("falls back to the message string when the hint is non-JSON garbage", () => {
    const info = parseTierLimitError({
      hint: "not-json-garbage",
      message: "estimate_limit_exceeded",
    });
    expect(info?.limit_type).toBe("estimates_total");
  });
});

describe("tierLimitPaywallKey", () => {
  it("maps each limit type to its paywall copy group", () => {
    expect(tierLimitPaywallKey("estimates_total")).toBe("estimates");
    expect(tierLimitPaywallKey("editors_per_project")).toBe("editors");
    expect(tierLimitPaywallKey("viewers_per_project")).toBe("editors");
    expect(tierLimitPaywallKey("can_create_organization")).toBe("organization");
    expect(tierLimitPaywallKey("can_create_business_card")).toBe("organization");
  });
});
