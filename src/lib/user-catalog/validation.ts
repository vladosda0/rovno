import type { ResourceLineType } from "@/types/estimate-v2";
import type {
  DraftRow,
  RowIssue,
  RowSeverity,
} from "@/types/user-catalog";

/**
 * Client-side mirror of the parse-price-list classification rules
 * (rovno-db/supabase/functions/parse-price-list/parsing.ts). The edge
 * function classifies the initial upload; this module re-validates rows live
 * as the user edits them in the review editor, so a fixed blocking error
 * clears without a round-trip. KEEP THE TWO RULE SETS IN SYNC.
 *
 * Philosophy (spec R-4): blocking only when the row cannot be represented
 * (empty name, unparseable price); everything else is a keepable warning.
 */

export const NAME_MAX_SOFT = 200;
export const MAX_PRICE_CENTS = 1_000_000_000_000;

// Canonical unit tokens (union across resource types) — mirrors
// resource-units.ts and the parser's CANONICAL_UNITS.
export const ALL_CANONICAL_UNITS = [
  "pcs", "pair", "m", "mm", "cm", "linear_m", "m²", "m³", "l", "ml",
  "kg", "g", "t", "set", "pack", "roll", "sheet", "bag", "bucket", "tube",
  "cylinder", "hour", "shift", "day", "week", "month", "man_hour",
  "man_shift", "man_day", "object", "stage", "service", "contract",
  "pct_of_cost", "km", "trip",
] as const;

const CANONICAL_UNIT_SET = new Set<string>(ALL_CANONICAL_UNITS);

export function isCanonicalUnit(unit: string): boolean {
  return CANONICAL_UNIT_SET.has(unit);
}

/**
 * Parse a user-facing price string into kopecks. Mirrors the edge parser:
 * spaces (incl. NBSP) are group separators, a lone comma is the Russian
 * decimal separator, mixed "." and "," resolve by last-separator-wins,
 * currency suffixes (₽, руб.) are stripped. Returns null when unparseable.
 */
export function parsePriceInputToCents(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  let cleaned = raw
    .replace(/руб(ль|лей|ля)?\.?/gi, "")
    .replace(/[₽рr]\.?$/i, "")
    .replace(/\s/g, "");

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    const decimal = lastDot > lastComma ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    cleaned = cleaned.split(grouping).join("");
    if (decimal === ",") cleaned = cleaned.replace(",", ".");
  } else if (hasComma) {
    cleaned = cleaned.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const cents = Math.round(Number.parseFloat(cleaned) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_PRICE_CENTS) return null;
  return cents;
}

/** Format kopecks as an editable price string ("850" / "1200,5"). */
export function formatCentsAsPriceInput(cents: number): string {
  const rub = cents / 100;
  if (Number.isInteger(rub)) return String(rub);
  return String(rub).replace(".", ",");
}

/** Format kopecks for display ("1 200,50 ₽" without the currency sign). */
export function formatCentsAsRub(cents: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function normalizeNameForCompare(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface RowValidationInput {
  name: string;
  unit: string;
  priceInput: string;
  supplierSku: string;
}

export interface RowValidationResult {
  issues: RowIssue[];
  severity: RowSeverity;
  priceCents: number | null;
}

/**
 * Re-validate one editable row. `duplicateNameKeys` is the set of normalized
 * names that occur more than once across the whole draft (computed by
 * `collectDuplicateNameKeys` so duplicate marks stay consistent).
 *
 * Deliberately NOT mirrored from the parser: TYPE_UNKNOWN / EXAMPLE_ROW /
 * SKU_TOO_LONG — the editor's selects and inputs make those states
 * unreachable (type is a fixed dropdown, sku input is length-capped), and an
 * example row that the user edits stops being an example row.
 */
export function validateDraftRow(
  input: RowValidationInput,
  duplicateNameKeys: ReadonlySet<string>,
): RowValidationResult {
  const issues: RowIssue[] = [];

  const name = input.name.trim();
  if (!name) {
    issues.push({ code: "NAME_EMPTY", field: "name", severity: "blocking" });
  } else {
    if (name.length > NAME_MAX_SOFT) {
      issues.push({ code: "NAME_TOO_LONG", field: "name", severity: "warning" });
    }
    if (duplicateNameKeys.has(normalizeNameForCompare(name))) {
      issues.push({ code: "NAME_DUPLICATE", field: "name", severity: "warning" });
    }
  }

  const unit = input.unit.trim();
  if (!unit) {
    issues.push({ code: "UNIT_EMPTY", field: "unit", severity: "warning" });
  } else if (!isCanonicalUnit(unit)) {
    issues.push({ code: "UNIT_UNKNOWN", field: "unit", severity: "warning" });
  }

  const priceCents = parsePriceInputToCents(input.priceInput);
  if (priceCents === null) {
    issues.push({ code: "PRICE_UNPARSEABLE", field: "price", severity: "blocking" });
  } else if (priceCents <= 0) {
    issues.push({ code: "PRICE_NON_POSITIVE", field: "price", severity: "warning" });
  }

  const severity: RowSeverity = issues.some((issue) => issue.severity === "blocking")
    ? "blocking"
    : issues.length > 0
      ? "warning"
      : "ok";

  return { issues, severity, priceCents };
}

/** Normalized names that occur 2+ times across the rows. */
export function collectDuplicateNameKeys(rows: ReadonlyArray<{ name: string }>): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeNameForCompare(row.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key));
}

export function computeSeverity(issues: ReadonlyArray<RowIssue>): RowSeverity {
  if (issues.some((issue) => issue.severity === "blocking")) return "blocking";
  return issues.length > 0 ? "warning" : "ok";
}

/**
 * Sync NAME_DUPLICATE marks across the whole draft (duplicates are a
 * cross-row property). Rows keep their other issues untouched, so parser-only
 * warnings (EXAMPLE_ROW / TYPE_UNKNOWN / SKU_TOO_LONG) survive on rows the
 * user has not edited.
 */
export function applyDuplicateMarks(rows: DraftRow[]): DraftRow[] {
  const duplicates = collectDuplicateNameKeys(rows);
  return rows.map((row) => {
    const marked = row.issues.some((issue) => issue.code === "NAME_DUPLICATE");
    const isDuplicate = duplicates.has(normalizeNameForCompare(row.name));
    if (marked === isDuplicate) return row;
    const issues = isDuplicate
      ? [...row.issues, { code: "NAME_DUPLICATE", field: "name", severity: "warning" } as RowIssue]
      : row.issues.filter((issue) => issue.code !== "NAME_DUPLICATE");
    return { ...row, issues, severity: computeSeverity(issues) };
  });
}

/**
 * Apply a user edit to one row: the edited row is fully re-validated (its
 * parser-only warnings drop — the user's input is now the source of truth),
 * every other row only gets its duplicate mark refreshed.
 */
export function editDraftRow(
  rows: DraftRow[],
  localId: string,
  patch: Partial<DraftRow>,
): DraftRow[] {
  const next = rows.map((row) => {
    if (row.localId !== localId) return row;
    const merged = { ...row, ...patch };
    const { issues, severity } = validateDraftRow(
      {
        name: merged.name,
        unit: merged.unit,
        priceInput: merged.priceInput,
        supplierSku: merged.supplierSku,
      },
      new Set<string>(), // duplicate marks are synced for all rows below
    );
    return { ...merged, issues, severity };
  });
  return applyDuplicateMarks(next);
}

export function removeDraftRow(rows: DraftRow[], localId: string): DraftRow[] {
  return applyDuplicateMarks(rows.filter((row) => row.localId !== localId));
}

export function appendEmptyDraftRow(rows: DraftRow[]): DraftRow[] {
  const empty: DraftRow = {
    localId: crypto.randomUUID(),
    name: "",
    unit: "",
    priceInput: "",
    resourceType: "material",
    typeAutoFilled: false,
    supplierSku: "",
    matchedArticleId: null,
    matchedArticleName: null,
    sourceRowNumber: null,
    issues: [],
    severity: "ok",
  };
  const { issues, severity } = validateDraftRow(
    { name: "", unit: "", priceInput: "", supplierSku: "" },
    new Set<string>(),
  );
  return [...rows, { ...empty, issues, severity }];
}

export function countBySeverity(rows: ReadonlyArray<{ severity: RowSeverity }>): {
  blocking: number;
  warning: number;
  ok: number;
} {
  let blocking = 0;
  let warning = 0;
  let ok = 0;
  for (const row of rows) {
    if (row.severity === "blocking") blocking += 1;
    else if (row.severity === "warning") warning += 1;
    else ok += 1;
  }
  return { blocking, warning, ok };
}

export const RESOURCE_TYPE_VALUES: ResourceLineType[] = [
  "material",
  "tool",
  "labor",
  "subcontractor",
  "overhead",
  "other",
];
