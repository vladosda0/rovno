import { describe, expect, it } from "vitest";
import {
  dateInputToIso,
  formatReportDay,
  formatReportPeriod,
  resolveCustomReportPeriod,
  toDateInputValue,
} from "@/lib/client-report-format";

// Local-time constructors, so the expectations hold in any CI time zone.
const iso = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).toISOString();
const NOW = new Date(2026, 9, 14, 15, 30);

describe("client report dates", () => {
  it("formats a day the way the mockup writes it", () => {
    expect(formatReportDay(iso(2026, 10, 13), "ru")).toBe("13 октября");
    expect(formatReportDay(null, "ru")).toBe("");
    expect(formatReportDay("not-a-date", "ru")).toBe("");
  });

  it("collapses a period inside one month", () => {
    expect(formatReportPeriod(iso(2026, 10, 9), iso(2026, 10, 13), "ru", NOW)).toBe("9–13 октября");
    expect(formatReportPeriod(iso(2026, 10, 9), iso(2026, 10, 13), "en", NOW)).toBe("October 9–13");
  });

  it("spells both ends when the period crosses a month", () => {
    expect(formatReportPeriod(iso(2026, 9, 25), iso(2026, 10, 1), "ru", NOW)).toBe("25 сентября – 1 октября");
  });

  it("shows one day when both ends fall on the same date", () => {
    expect(formatReportPeriod(iso(2026, 10, 13, 9), iso(2026, 10, 13, 18), "ru", NOW)).toBe("13 октября");
  });

  it("prints both years when the period crosses a year", () => {
    expect(formatReportPeriod(iso(2025, 10, 13), iso(2026, 10, 13), "ru", NOW)).toBe(
      "13 октября 2025 – 13 октября 2026",
    );
    expect(formatReportPeriod(iso(2025, 12, 29), iso(2026, 1, 4), "en", NOW)).toBe(
      "December 29, 2025 – January 4, 2026",
    );
  });

  it("prints the year of a period that is not in the current year", () => {
    expect(formatReportPeriod(iso(2025, 10, 9), iso(2025, 10, 13), "ru", NOW)).toBe("9–13 октября 2025");
    expect(formatReportPeriod(iso(2025, 9, 25), iso(2025, 10, 1), "ru", NOW)).toBe(
      "25 сентября – 1 октября 2025",
    );
    expect(formatReportPeriod(iso(2025, 10, 13, 9), iso(2025, 10, 13, 18), "ru", NOW)).toBe("13 октября 2025");
    expect(formatReportPeriod(iso(2025, 10, 9), iso(2025, 10, 13), "en", NOW)).toBe("October 9–13, 2025");
  });

  it("round-trips a date input through the local day", () => {
    expect(toDateInputValue(iso(2026, 10, 9))).toBe("2026-10-09");
    expect(new Date(dateInputToIso("2026-10-09", "start")!).getHours()).toBe(0);
    expect(new Date(dateInputToIso("2026-10-09", "end")!).getHours()).toBe(23);
    expect(dateInputToIso("garbage", "start")).toBeNull();
  });
});

describe("resolveCustomReportPeriod", () => {
  it("accepts two dates in order and spans them from start of day to end of day", () => {
    const period = resolveCustomReportPeriod("2026-10-01", "2026-10-13", NOW)!;
    expect(period.from).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString());
    expect(period.to).toBe(new Date(2026, 9, 13, 23, 59, 59, 999).toISOString());
  });

  it("clamps an end later than today to today", () => {
    const period = resolveCustomReportPeriod("2026-10-01", "2026-12-31", NOW)!;
    expect(toDateInputValue(period.to)).toBe("2026-10-14");
  });

  it("allows a period of today alone", () => {
    expect(resolveCustomReportPeriod("2026-10-14", "2026-10-14", NOW)).not.toBeNull();
  });

  it.each([
    ["a missing start", "", "2026-10-13"],
    ["a missing end", "2026-10-01", ""],
    ["a start after the end", "2026-10-13", "2026-10-01"],
    ["a start in the future", "2026-10-20", "2026-10-25"],
    ["a start older than five years", "2021-10-13", "2026-10-13"],
    ["a half-typed year", "0002-10-01", "2026-10-13"],
    ["a year typed digit by digit", "0202-10-01", "2026-10-13"],
  ])("refuses %s", (_name, from, to) => {
    expect(resolveCustomReportPeriod(from, to, NOW)).toBeNull();
  });

  it("accepts a start just inside five years", () => {
    expect(resolveCustomReportPeriod("2021-10-15", "2026-10-13", NOW)).not.toBeNull();
  });
});
