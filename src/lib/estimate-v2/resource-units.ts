import type { ResourceLineType } from "@/types/estimate-v2";

export const CUSTOM_UNIT_SENTINEL = "__custom__";

/**
 * Units are stored as canonical English strings in the database. Display
 * labels are localized at render time via `getUnitLabel` / `buildUnitSelectOptions`.
 */
const RESOURCE_UNITS_BY_TYPE: Record<ResourceLineType, string[]> = {
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

type UnitTranslator = (key: string, options?: Record<string, unknown>) => string;

/**
 * Map a canonical unit value (as stored in DB) to a user-visible label.
 * When no translator is provided (tests, background jobs), returns the raw value.
 */
export function getUnitLabel(unit: string, t?: UnitTranslator): string {
  if (!t) return unit;
  if (unit === CUSTOM_UNIT_SENTINEL) {
    return t("estimate.unit.custom", { defaultValue: "Other" });
  }
  const key = `estimate.unit.${unit}`;
  return t(key, { defaultValue: unit });
}

export function getUnitOptionsForType(type: ResourceLineType): string[] {
  return RESOURCE_UNITS_BY_TYPE[type];
}

export function isKnownUnitForType(type: ResourceLineType, unit: string): boolean {
  return RESOURCE_UNITS_BY_TYPE[type].includes(unit);
}

export function resolveUnitSelectValue(type: ResourceLineType, unit: string): string {
  return isKnownUnitForType(type, unit) ? unit : CUSTOM_UNIT_SENTINEL;
}

export function buildUnitSelectOptions(
  type: ResourceLineType,
  t?: UnitTranslator,
): Array<{ value: string; label: string }> {
  return [
    ...RESOURCE_UNITS_BY_TYPE[type].map((unit) => ({
      value: unit,
      label: getUnitLabel(unit, t),
    })),
    {
      value: CUSTOM_UNIT_SENTINEL,
      label: t ? t("estimate.unit.custom", { defaultValue: "Other" }) : "Other",
    },
  ];
}
