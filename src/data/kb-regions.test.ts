import { describe, expect, it } from "vitest";
import {
  KB_COUNTRIES,
  kbRegionAfterCountryChange,
  kbRegionsFor,
  normalizeKbCountry,
  normalizeKbRegion,
} from "@/data/kb-regions";

describe("kb-regions (rovno-db#230)", () => {
  it("lists Russia first, then the CIS countries alphabetically, as the database check allows", () => {
    expect(KB_COUNTRIES).toEqual(["RU", "AZ", "AM", "BY", "KZ", "KG", "MD", "TJ", "TM", "UZ"]);
  });

  it("every country has regions and every region fits the database length check", () => {
    for (const c of KB_COUNTRIES) {
      const regions = kbRegionsFor(c);
      expect(regions.length).toBeGreaterThan(0);
      expect(new Set(regions).size).toBe(regions.length);
      for (const r of regions) expect(r.length).toBeLessThanOrEqual(120);
    }
    expect(kbRegionsFor("RU")).toHaveLength(89);
    expect(kbRegionsFor("RU")).toContain("Республика Татарстан");
    expect(kbRegionsFor("KZ")).toContain("Алматинская область");
  });

  it("an unknown country is Russia, and a region of another country is dropped", () => {
    expect(normalizeKbCountry("UA")).toBe("RU");
    expect(normalizeKbCountry(undefined)).toBe("RU");
    expect(normalizeKbCountry("BY")).toBe("BY");
    expect(normalizeKbRegion("KZ", "Алматинская область")).toBe("Алматинская область");
    expect(normalizeKbRegion("RU", "Алматинская область")).toBeNull();
    expect(normalizeKbRegion("RU", "")).toBeNull();
    expect(normalizeKbRegion("RU", null)).toBeNull();
  });

  it("picking another country clears the region, picking the same keeps it", () => {
    expect(kbRegionAfterCountryChange("KZ", "RU", "Алматинская область")).toBeNull();
    expect(kbRegionAfterCountryChange("KZ", "KZ", "Алматинская область")).toBe("Алматинская область");
  });
});
