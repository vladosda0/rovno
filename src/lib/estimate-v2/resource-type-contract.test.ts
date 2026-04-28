import { describe, expect, it } from "vitest";
import {
  checklistEstimateV2ResourceType,
  isHrResourceLineType,
  isProcurementResourceLineType,
  parsePersistedEstimateResourceType,
  projectToHrItemType,
  projectToProcurementItemType,
  resourceLineTypeFromPersisted,
  resourceLineSemanticLabel,
  resourceLineTypeToPersisted,
  type DbEstimateResourceType,
} from "@/lib/estimate-v2/resource-type-contract";
import type { ResourceLineType } from "@/types/estimate-v2";

const ALL_TYPES: ResourceLineType[] = [
  "material",
  "tool",
  "labor",
  "subcontractor",
  "overhead",
  "other",
];

describe("resource-type-contract", () => {
  describe("parsePersistedEstimateResourceType", () => {
    it.each(ALL_TYPES)("accepts canonical value '%s'", (value) => {
      const result = parsePersistedEstimateResourceType(value);
      expect(result).toEqual({ ok: true, db: value });
    });

    it.each([null, undefined, "", "equipment", "Material", 42, true])(
      "rejects invalid input %j",
      (value) => {
        expect(parsePersistedEstimateResourceType(value)).toEqual({ ok: false });
      },
    );
  });

  describe("identity mapping (post-Session 0 alignment)", () => {
    it.each(ALL_TYPES)("app '%s' <-> db '%s'", (value) => {
      expect(resourceLineTypeToPersisted(value)).toBe(value);
      expect(resourceLineTypeFromPersisted(value)).toBe(value);
    });
  });

  describe("resourceLineSemanticLabel", () => {
    it.each([
      ["material", "estimate.resource.semantic.material"],
      ["tool", "estimate.resource.semantic.tool"],
      ["labor", "estimate.resource.semantic.labor"],
      ["subcontractor", "estimate.resource.semantic.subcontractor"],
      ["overhead", "estimate.resource.semantic.overhead"],
      ["other", "estimate.resource.semantic.other"],
    ] satisfies [ResourceLineType, string][])("maps '%s' -> '%s'", (type, label) => {
      expect(resourceLineSemanticLabel(type)).toBe(label);
    });
  });

  describe("projectToProcurementItemType", () => {
    it("material -> ok material", () => {
      expect(projectToProcurementItemType("material")).toEqual({ kind: "ok", type: "material" });
    });

    it("tool -> ok tool", () => {
      expect(projectToProcurementItemType("tool")).toEqual({ kind: "ok", type: "tool" });
    });

    it.each(["labor", "subcontractor", "overhead", "other"] satisfies DbEstimateResourceType[])(
      "%s -> non_procurement",
      (db) => {
        expect(projectToProcurementItemType(db)).toEqual({ kind: "non_procurement" });
      },
    );

    it("null -> broken", () => {
      expect(projectToProcurementItemType(null)).toEqual({ kind: "broken" });
    });

    it("undefined -> broken", () => {
      expect(projectToProcurementItemType(undefined)).toEqual({ kind: "broken" });
    });
  });

  describe("projectToHrItemType", () => {
    it("labor -> ok labor", () => {
      expect(projectToHrItemType("labor")).toEqual({ kind: "ok", type: "labor" });
    });

    it("subcontractor -> ok subcontractor", () => {
      expect(projectToHrItemType("subcontractor")).toEqual({ kind: "ok", type: "subcontractor" });
    });

    it.each(["material", "tool", "overhead", "other"] satisfies DbEstimateResourceType[])(
      "%s -> non_hr",
      (db) => {
        expect(projectToHrItemType(db)).toEqual({ kind: "non_hr" });
      },
    );

    it("null -> broken", () => {
      expect(projectToHrItemType(null)).toEqual({ kind: "broken" });
    });
  });

  describe("isProcurementResourceLineType", () => {
    it.each(ALL_TYPES)("type '%s'", (type) => {
      const expected = type === "material" || type === "tool";
      expect(isProcurementResourceLineType(type)).toBe(expected);
    });
  });

  describe("isHrResourceLineType", () => {
    it.each(ALL_TYPES)("type '%s'", (type) => {
      const expected = type === "labor" || type === "subcontractor";
      expect(isHrResourceLineType(type)).toBe(expected);
    });
  });

  describe("checklistEstimateV2ResourceType", () => {
    it.each(ALL_TYPES)("db '%s' -> '%s'", (value) => {
      expect(checklistEstimateV2ResourceType(value)).toBe(value);
    });

    it("null -> undefined", () => {
      expect(checklistEstimateV2ResourceType(null)).toBeUndefined();
    });

    it("undefined -> undefined", () => {
      expect(checklistEstimateV2ResourceType(undefined)).toBeUndefined();
    });
  });
});
