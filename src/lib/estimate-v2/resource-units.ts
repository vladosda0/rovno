import type { ResourceLineType } from "@/types/estimate-v2";

export const CUSTOM_UNIT_SENTINEL = "__custom__";

const RESOURCE_UNITS_BY_TYPE: Record<ResourceLineType, string[]> = {
  material: ["pcs", "m", "m²", "m³", "kg", "t", "l", "set", "pack"],
  labor: ["hour", "day", "shift", "job", "m²", "m³"],
  tool: ["hour", "day", "week", "month", "pcs"],
  subcontractor: ["job", "m²", "m³", "day"],
  other: ["item", "set", "job"],
};

export function getUnitOptionsForType(type: ResourceLineType): string[] {
  return RESOURCE_UNITS_BY_TYPE[type];
}

export function isKnownUnitForType(type: ResourceLineType, unit: string): boolean {
  return RESOURCE_UNITS_BY_TYPE[type].includes(unit);
}

export function resolveUnitSelectValue(type: ResourceLineType, unit: string): string {
  return isKnownUnitForType(type, unit) ? unit : CUSTOM_UNIT_SENTINEL;
}

export function buildUnitSelectOptions(type: ResourceLineType): Array<{ value: string; label: string }> {
  return [
    ...RESOURCE_UNITS_BY_TYPE[type].map((unit) => ({ value: unit, label: unit })),
    { value: CUSTOM_UNIT_SENTINEL, label: "Other" },
  ];
}
