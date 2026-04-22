import type { ResourceLineType } from "@/types/estimate-v2";
import type { ProcurementItemType } from "@/types/entities";
import type { HRItemType } from "@/types/hr";

/**
 * Canonical DB-persisted values for `estimate_resource_lines.resource_type`.
 * Must match the check constraint in `backend-truth`.
 */
export type DbEstimateResourceType = "material" | "labor" | "subcontractor" | "equipment" | "other";

const DB_ESTIMATE_RESOURCE_TYPES = new Set<string>(["material", "labor", "subcontractor", "equipment", "other"]);

// ---------------------------------------------------------------------------
// Parse / validate
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; db: DbEstimateResourceType }
  | { ok: false };

export function parsePersistedEstimateResourceType(raw: unknown): ParseResult {
  if (typeof raw === "string" && DB_ESTIMATE_RESOURCE_TYPES.has(raw)) {
    return { ok: true, db: raw as DbEstimateResourceType };
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Bidirectional mapping: ResourceLineType <-> DbEstimateResourceType
// ---------------------------------------------------------------------------

export function resourceLineTypeToPersisted(type: ResourceLineType): DbEstimateResourceType {
  if (type === "tool") return "equipment";
  return type;
}

export function resourceLineTypeFromPersisted(db: DbEstimateResourceType): ResourceLineType {
  if (db === "equipment") return "tool";
  return db;
}

// ---------------------------------------------------------------------------
// Display / semantic labels
// ---------------------------------------------------------------------------

// Labels are i18n keys; callers must translate via useTranslation's t() before display.
const SEMANTIC_LABELS: Record<ResourceLineType, string> = {
  material: "estimate.resource.semantic.material",
  tool: "estimate.resource.semantic.tool",
  labor: "estimate.resource.semantic.labor",
  subcontractor: "estimate.resource.semantic.subcontractor",
  other: "estimate.resource.semantic.other",
};

export function resourceLineSemanticLabel(type: ResourceLineType): string {
  return SEMANTIC_LABELS[type];
}

// ---------------------------------------------------------------------------
// Domain projections
// ---------------------------------------------------------------------------

export type ProcurementProjection =
  | { kind: "ok"; type: ProcurementItemType }
  | { kind: "non_procurement" }
  | { kind: "broken" };

export function projectToProcurementItemType(
  db: DbEstimateResourceType | null | undefined,
): ProcurementProjection {
  if (db == null) return { kind: "broken" };
  if (db === "material") return { kind: "ok", type: "material" };
  if (db === "equipment") return { kind: "ok", type: "tool" };
  if (db === "labor" || db === "subcontractor" || db === "other") return { kind: "non_procurement" };
  return { kind: "broken" };
}

export type HrProjection =
  | { kind: "ok"; type: HRItemType }
  | { kind: "non_hr" }
  | { kind: "broken" };

export function projectToHrItemType(
  db: DbEstimateResourceType | null | undefined,
): HrProjection {
  if (db == null) return { kind: "broken" };
  if (db === "labor") return { kind: "ok", type: "labor" };
  if (db === "subcontractor") return { kind: "ok", type: "subcontractor" };
  if (db === "material" || db === "equipment" || db === "other") return { kind: "non_hr" };
  return { kind: "broken" };
}

// ---------------------------------------------------------------------------
// Procurement filter (which ResourceLineTypes feed procurement)
// ---------------------------------------------------------------------------

const PROCUREMENT_LINE_TYPES = new Set<ResourceLineType>(["material", "tool"]);

export function isProcurementResourceLineType(type: ResourceLineType): boolean {
  return PROCUREMENT_LINE_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// HR filter (which ResourceLineTypes feed HR)
// ---------------------------------------------------------------------------

const HR_LINE_TYPES = new Set<ResourceLineType>(["labor", "subcontractor"]);

export function isHrResourceLineType(type: ResourceLineType): boolean {
  return HR_LINE_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Checklist mirror helper
// ---------------------------------------------------------------------------

export function checklistEstimateV2ResourceType(
  db: DbEstimateResourceType | null | undefined,
): ResourceLineType | undefined {
  if (db == null) return undefined;
  return resourceLineTypeFromPersisted(db);
}
