import { describe, expect, it } from "vitest";
import enLocale from "@/locales/en.json";
import ruLocale from "@/locales/ru.json";
import {
  buildUnitSelectOptions,
  CUSTOM_UNIT_SENTINEL,
  getUnitOptionsForType,
  isKnownUnitForType,
  resolveUnitSelectValue,
} from "@/lib/estimate-v2/resource-units";
import type { ResourceLineType } from "@/types/estimate-v2";

const EXPECTED_UNITS_BY_TYPE: Record<ResourceLineType, string[]> = {
  material: [
    "pcs", "pair", "m", "mm", "cm", "linear_m",
    "m²", "m³", "l", "ml",
    "kg", "g", "t",
    "set", "pack", "roll", "sheet", "bag", "bucket", "tube", "cylinder",
  ],
  tool: ["pcs", "set", "hour", "shift", "day", "week", "month"],
  labor: [
    "hour", "shift", "day", "month",
    "man_hour", "man_shift", "man_day",
    "m²", "linear_m", "m³", "pcs",
  ],
  subcontractor: [
    "hour", "shift", "day", "month",
    "m²", "m", "linear_m", "m³", "pcs", "t", "kg",
    "object", "stage", "service", "contract",
  ],
  overhead: [
    "pct_of_cost", "service",
    "day", "week", "month",
    "km", "trip",
    "m³", "t", "pcs",
  ],
  other: ["pcs", "set", "service", "hour", "day", "pct_of_cost"],
};

const ALL_TYPES = Object.keys(EXPECTED_UNITS_BY_TYPE) as ResourceLineType[];

describe("estimate-v2 resource units", () => {
  describe("getUnitOptionsForType", () => {
    it.each(ALL_TYPES)("returns the canonical list for '%s'", (type) => {
      expect(getUnitOptionsForType(type)).toEqual(EXPECTED_UNITS_BY_TYPE[type]);
    });

    it.each(ALL_TYPES)("has no duplicate values within '%s'", (type) => {
      const list = getUnitOptionsForType(type);
      expect(new Set(list).size).toBe(list.length);
    });
  });

  describe("isKnownUnitForType", () => {
    it.each(ALL_TYPES)("accepts every canonical unit for '%s'", (type) => {
      for (const unit of EXPECTED_UNITS_BY_TYPE[type]) {
        expect(isKnownUnitForType(type, unit)).toBe(true);
      }
    });

    it.each(ALL_TYPES)("rejects nonsense input for '%s'", (type) => {
      expect(isKnownUnitForType(type, "definitely-not-a-unit")).toBe(false);
      expect(isKnownUnitForType(type, "")).toBe(false);
    });
  });

  describe("resolveUnitSelectValue", () => {
    it("returns canonical value when known", () => {
      expect(resolveUnitSelectValue("material", "pcs")).toBe("pcs");
      expect(resolveUnitSelectValue("overhead", "pct_of_cost")).toBe("pct_of_cost");
    });

    it("returns the custom sentinel when unknown for the given type", () => {
      expect(resolveUnitSelectValue("material", "bundle")).toBe(CUSTOM_UNIT_SENTINEL);
      expect(resolveUnitSelectValue("tool", "pct_of_cost")).toBe(CUSTOM_UNIT_SENTINEL);
    });
  });

  describe("buildUnitSelectOptions", () => {
    it.each(ALL_TYPES)("returns canonical options plus the trailing custom sentinel for '%s'", (type) => {
      const options = buildUnitSelectOptions(type);
      const expected = EXPECTED_UNITS_BY_TYPE[type];
      expect(options.slice(0, -1).map((opt) => opt.value)).toEqual(expected);
      const last = options[options.length - 1];
      expect(last).toEqual({ value: CUSTOM_UNIT_SENTINEL, label: "Other" });
    });
  });

  describe("i18n labels", () => {
    const allCanonicalUnits = Array.from(
      new Set(ALL_TYPES.flatMap((type) => EXPECTED_UNITS_BY_TYPE[type])),
    );

    it.each(allCanonicalUnits)("has a non-empty RU label for '%s'", (unit) => {
      const key = `estimate.unit.${unit}`;
      const label = (ruLocale as Record<string, string>)[key];
      expect(typeof label).toBe("string");
      expect(label?.trim() ?? "").not.toBe("");
    });

    it.each(allCanonicalUnits)("has a non-empty EN label for '%s'", (unit) => {
      const key = `estimate.unit.${unit}`;
      const label = (enLocale as Record<string, string>)[key];
      expect(typeof label).toBe("string");
      expect(label?.trim() ?? "").not.toBe("");
    });
  });
});
