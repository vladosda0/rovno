import { describe, expect, it } from "vitest";
import {
  buildUnitSelectOptions,
  CUSTOM_UNIT_SENTINEL,
  getUnitOptionsForType,
  resolveUnitSelectValue,
} from "@/lib/estimate-v2/resource-units";

describe("estimate-v2 resource units", () => {
  it("provides exact unit list per resource type", () => {
    expect(getUnitOptionsForType("material")).toEqual(["pcs", "m", "m²", "m³", "kg", "t", "l", "set", "pack"]);
    expect(getUnitOptionsForType("labor")).toEqual(["hour", "day", "shift", "job", "m²", "m³"]);
    expect(getUnitOptionsForType("tool")).toEqual(["hour", "day", "week", "month", "pcs"]);
    expect(getUnitOptionsForType("subcontractor")).toEqual(["job", "m²", "m³", "day"]);
    expect(getUnitOptionsForType("other")).toEqual(["item", "set", "job"]);
  });

  it("keeps Other (custom sentinel) option as the last dropdown item", () => {
    const options = buildUnitSelectOptions("material");
    expect(options[options.length - 1]).toEqual({
      value: CUSTOM_UNIT_SENTINEL,
      label: "Other",
    });
  });

  it("resolves unknown unit values to custom selection", () => {
    expect(resolveUnitSelectValue("material", "pcs")).toBe("pcs");
    expect(resolveUnitSelectValue("material", "bundle")).toBe(CUSTOM_UNIT_SENTINEL);
  });
});
