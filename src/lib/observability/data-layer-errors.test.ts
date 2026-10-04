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

  it("skips the plain-object network failure postgrest-js returns for queries", () => {
    const offlinePostgrest = { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" };
    expect(shouldReportDataLayerError(offlinePostgrest, "query")).toBe(false);
    expect(shouldReportDataLayerError(offlinePostgrest, "mutation")).toBe(true);

    const safari = { message: "TypeError: Load failed", details: "", hint: "", code: "" };
    expect(shouldReportDataLayerError(safari, "query")).toBe(false);

    const firefox = {
      message: "TypeError: NetworkError when attempting to fetch resource.",
      details: "",
      hint: "",
      code: "",
    };
    expect(shouldReportDataLayerError(firefox, "query")).toBe(false);
  });

  it("still reports a defect whose message merely contains a network pattern", () => {
    // "load failed" is a substring of "upload failed": matching the message
    // alone would classify a real defect as offline noise.
    expect(shouldReportDataLayerError({ message: "Document upload failed" }, "query")).toBe(true);
    expect(
      shouldReportDataLayerError(
        { message: "Failed to fetch price list", details: null, hint: null, code: "P0001" },
        "query",
      ),
    ).toBe(true);
    expect(shouldReportDataLayerError(new Error("Document upload failed"), "query")).toBe(true);

    // Strict equality on the code is load-bearing: `0 == ""` is true, so a
    // loose compare would swallow a legacy DOMException-shaped error.
    expect(
      shouldReportDataLayerError({ code: 0, message: "Load failed while decoding" }, "query"),
    ).toBe(true);
  });

  it("reports real defects for both kinds", () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
    expect(shouldReportDataLayerError(bug, "query")).toBe(true);
    expect(shouldReportDataLayerError(bug, "mutation")).toBe(true);

    const postgrest = { message: 'permission denied for table "estimates"', code: "42501" };
    expect(shouldReportDataLayerError(postgrest, "query")).toBe(true);
  });
});
