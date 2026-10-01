import { describe, expect, it } from "vitest";
import { DOCUMENT_UPLOAD_ACCEPT, isSvgFile } from "./document-file-types";

// rovno #284 S6. This pin exists because a review-round mutant gutted the list
// to ".pdf" and the full suite stayed green: on iOS/Android the picker ENFORCES
// `accept` with no "All Files" escape, so a silently narrowed list is a format
// phone users can no longer attach at all - invisible to every other test.
describe("DOCUMENT_UPLOAD_ACCEPT", () => {
  const entries = DOCUMENT_UPLOAD_ACCEPT.split(",");

  it("keeps every format class the product stores and hands back", () => {
    for (const required of [
      "image/*", ".heic", ".heif",           // photos, incl. the Android image/* gap
      ".pdf", ".doc", ".docx", ".odt",       // documents
      ".xls", ".xlsx", ".csv",               // spreadsheets
      ".ppt", ".pptx",                        // presentations
      ".dwg", ".zip",                         // drawings and archives
    ]) {
      expect(entries).toContain(required);
    }
  });

  it("is a well-formed accept attribute: no blanks, no duplicates", () => {
    expect(entries.every((entry) => entry.length > 0 && !entry.includes(" "))).toBe(true);
    expect(new Set(entries).size).toBe(entries.length);
  });
});

describe("isSvgFile", () => {
  it.each([
    ["logo.svg", "image/svg+xml"],
    ["logo.SVG", ""],
    ["logo.svgz", "application/octet-stream"],
    ["logo.svg ", ""],
    ["logo.png", "image/svg+xml"],
    ["logo", " Image/SVG+XML; charset=utf-8"],
  ])("refuses %s (%s)", (name, type) => {
    expect(isSvgFile({ name, type })).toBe(true);
  });

  it.each([
    ["photo.png", "image/png"],
    ["plan.pdf", "application/pdf"],
    ["svg-export.png", "image/png"],
    ["notes.svg.txt", "text/plain"],
    ["plan.dwg", ""],
  ])("lets %s (%s) through", (name, type) => {
    expect(isSvgFile({ name, type })).toBe(false);
  });
});
