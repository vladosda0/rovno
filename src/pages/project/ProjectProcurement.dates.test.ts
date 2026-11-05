import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { formatProcurementDate } from "@/lib/procurement-dates";

describe("procurement dates follow the interface language, not the browser", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("prints day.month.year in the Russian interface", async () => {
    await i18n.changeLanguage("ru");
    expect(formatProcurementDate("2026-08-10", "—")).toBe("10.08.2026");
    expect(formatProcurementDate("2026-02-02T00:00:00.000Z", "—")).toMatch(/^0[12]\.02\.2026$/);
  });

  it("prints month/day/year in the English interface", async () => {
    await i18n.changeLanguage("en");
    expect(formatProcurementDate("2026-08-10", "—")).toBe("8/10/2026");
  });

  it("keeps the dash for an empty or unreadable value", () => {
    expect(formatProcurementDate(null, "—")).toBe("—");
    expect(formatProcurementDate("not a date", "—")).toBe("—");
  });
});
