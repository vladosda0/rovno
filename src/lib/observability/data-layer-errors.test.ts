import { describe, expect, it } from "vitest";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
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

  it("skips the plain-object abort postgrest-js returns, which has no name", () => {
    const aborted = {
      message: "AbortError: signal is aborted without reason",
      details: "",
      hint: "Request was aborted (timeout or manual cancellation)",
      code: "",
    };
    expect(shouldReportDataLayerError(aborted, "query")).toBe(false);
    expect(shouldReportDataLayerError(aborted, "mutation")).toBe(false);

    // A server error that merely quotes the word keeps its non-empty code.
    expect(
      shouldReportDataLayerError({ message: "AbortError: upstream gave up", code: "PGRST000" }, "mutation"),
    ).toBe(true);
    expect(
      shouldReportDataLayerError({ message: "saw AbortError: mid-message", details: "", hint: "", code: "" }, "mutation"),
    ).toBe(true);
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

  it("skips an edge-function call that never left the browser, for queries only", () => {
    const offlineInvoke = new FunctionsFetchError(new TypeError("Failed to fetch"));
    expect(shouldReportDataLayerError(offlineInvoke, "query")).toBe(false);
    expect(shouldReportDataLayerError(offlineInvoke, "mutation")).toBe(true);

    // The wrapper says only that the fetch chain rejected; the cause decides.
    expect(shouldReportDataLayerError(new FunctionsFetchError(new RangeError("bug")), "query")).toBe(true);
    expect(shouldReportDataLayerError(new FunctionsFetchError(new Error("Failed to fetch")), "query")).toBe(true);
    expect(shouldReportDataLayerError(new FunctionsFetchError(undefined), "query")).toBe(true);

    // The function answered: that is a server outcome, not connectivity.
    expect(shouldReportDataLayerError(new FunctionsHttpError(new Response(null, { status: 500 })), "query")).toBe(true);
    expect(shouldReportDataLayerError({ name: "FunctionsFetchError", message: "x" }, "query")).toBe(true);
    // The class is what is matched, never the text.
    expect(
      shouldReportDataLayerError(new Error("Failed to send a request to the Edge Function"), "query"),
    ).toBe(true);
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

  it("skips a coded refusal only when it is a thrown Error", () => {
    const refusal = Object.assign(new Error("Too many card binding attempts"), { code: "attempt_limit" });
    expect(shouldReportDataLayerError(refusal, "mutation")).toBe(false);
    expect(shouldReportDataLayerError(refusal, "query")).toBe(false);

    expect(shouldReportDataLayerError({ message: "boom", code: "attempt_limit" }, "mutation")).toBe(true);
    expect(shouldReportDataLayerError(Object.assign(new Error("boom"), { code: "42501" }), "mutation")).toBe(true);
  });
});
