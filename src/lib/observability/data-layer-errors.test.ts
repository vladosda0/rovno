import { describe, expect, it } from "vitest";
import { shouldReportDataLayerError } from "./data-layer-errors";

function tierLimitError() {
  return {
    message: "estimate_limit_exceeded",
    hint: JSON.stringify({ reason: "tier_limit", limit_type: "estimates_total" }),
  };
}

describe("shouldReportDataLayerError", () => {
  it("skips abort errors for both kinds", () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    expect(shouldReportDataLayerError(abort, "query")).toBe(false);
    expect(shouldReportDataLayerError(abort, "mutation")).toBe(false);
  });

  it("skips backend tier-limit paywall errors", () => {
    expect(shouldReportDataLayerError(tierLimitError(), "mutation")).toBe(false);
    expect(shouldReportDataLayerError(tierLimitError(), "query")).toBe(false);
  });

  it("skips pure network failures for queries but reports them for mutations", () => {
    const offline = new TypeError("Failed to fetch");
    expect(shouldReportDataLayerError(offline, "query")).toBe(false);
    expect(shouldReportDataLayerError(offline, "mutation")).toBe(true);
  });

  it("reports real defects for both kinds", () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
    expect(shouldReportDataLayerError(bug, "query")).toBe(true);
    expect(shouldReportDataLayerError(bug, "mutation")).toBe(true);

    const postgrest = { message: 'permission denied for table "estimates"', code: "42501" };
    expect(shouldReportDataLayerError(postgrest, "query")).toBe(true);
  });
});
