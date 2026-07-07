import { describe, expect, it } from "vitest";

import type { DraftRow } from "@/types/user-catalog";
import {
  appendEmptyDraftRow,
  collectDuplicateNameKeys,
  countBySeverity,
  editDraftRow,
  formatCentsAsPriceInput,
  parsePriceInputToCents,
  removeDraftRow,
  validateDraftRow,
} from "./validation";

// Mirrors rovno-db/supabase/functions/tests/parse-price-list-test.ts for the
// shared price-format rules — the two rule sets must agree.
describe("parsePriceInputToCents", () => {
  it("handles Russian number formats", () => {
    expect(parsePriceInputToCents("1 000")).toBe(100000);
    expect(parsePriceInputToCents("1000,50")).toBe(100050);
    expect(parsePriceInputToCents("1.200,50")).toBe(120050);
    expect(parsePriceInputToCents("1,200.50")).toBe(120050);
    expect(parsePriceInputToCents("850 руб.")).toBe(85000);
    expect(parsePriceInputToCents("850 ₽")).toBe(85000);
    expect(parsePriceInputToCents("-100")).toBe(-10000);
  });

  it("rejects non-numeric input", () => {
    expect(parsePriceInputToCents("договорная")).toBeNull();
    expect(parsePriceInputToCents("")).toBeNull();
    expect(parsePriceInputToCents("10x20")).toBeNull();
  });
});

describe("formatCentsAsPriceInput", () => {
  it("renders whole rubles without decimals and fractions with a comma", () => {
    expect(formatCentsAsPriceInput(85000)).toBe("850");
    expect(formatCentsAsPriceInput(120050)).toBe("1200,5");
  });
});

function makeRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    localId: overrides.localId ?? crypto.randomUUID(),
    name: "Песок речной",
    unit: "m³",
    priceInput: "850",
    resourceType: "material",
    typeAutoFilled: false,
    supplierSku: "",
    matchedArticleId: null,
    matchedArticleName: null,
    sourceRowNumber: 2,
    issues: [],
    severity: "ok",
    ...overrides,
  };
}

describe("validateDraftRow", () => {
  const noDuplicates = new Set<string>();

  it("passes a clean canonical row", () => {
    const result = validateDraftRow(
      { name: "Песок", unit: "m³", priceInput: "850", supplierSku: "" },
      noDuplicates,
    );
    expect(result.severity).toBe("ok");
    expect(result.priceCents).toBe(85000);
  });

  it("blocks an empty name and an unparseable price", () => {
    const result = validateDraftRow(
      { name: " ", unit: "", priceInput: "договорная", supplierSku: "" },
      noDuplicates,
    );
    expect(result.severity).toBe("blocking");
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["NAME_EMPTY", "PRICE_UNPARSEABLE", "UNIT_EMPTY"]),
    );
  });

  it("warns on zero price, unknown unit and duplicates without blocking", () => {
    const result = validateDraftRow(
      { name: "Доска", unit: "вагон", priceInput: "0", supplierSku: "" },
      new Set(["доска"]),
    );
    expect(result.severity).toBe("warning");
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["PRICE_NON_POSITIVE", "UNIT_UNKNOWN", "NAME_DUPLICATE"]),
    );
  });
});

describe("editDraftRow", () => {
  it("re-validates the edited row and keeps parser-only warnings on untouched rows", () => {
    const untouched = makeRow({
      localId: "untouched",
      issues: [{ code: "EXAMPLE_ROW", field: "name", severity: "warning" }],
      severity: "warning",
    });
    const edited = makeRow({
      localId: "edited",
      name: "Кладка перегородок",
      priceInput: "договорная",
      issues: [{ code: "PRICE_UNPARSEABLE", field: "price", severity: "blocking" }],
      severity: "blocking",
    });

    const next = editDraftRow([untouched, edited], "edited", { priceInput: "1200,50" });

    const fixed = next.find((row) => row.localId === "edited");
    expect(fixed?.severity).toBe("ok");
    const kept = next.find((row) => row.localId === "untouched");
    expect(kept?.issues.map((i) => i.code)).toContain("EXAMPLE_ROW");
  });

  it("syncs duplicate marks across rows when a name changes", () => {
    const a = makeRow({ localId: "a", name: "Цемент" });
    const b = makeRow({ localId: "b", name: "Песок" });

    const withDuplicate = editDraftRow([a, b], "b", { name: "Цемент" });
    expect(
      withDuplicate.every((row) =>
        row.issues.some((issue) => issue.code === "NAME_DUPLICATE"),
      ),
    ).toBe(true);

    const withoutDuplicate = editDraftRow(withDuplicate, "b", { name: "Песок" });
    expect(
      withoutDuplicate.every(
        (row) => !row.issues.some((issue) => issue.code === "NAME_DUPLICATE"),
      ),
    ).toBe(true);
  });
});

describe("draft row list helpers", () => {
  it("appendEmptyDraftRow adds a blocking (empty-name) row", () => {
    const next = appendEmptyDraftRow([makeRow()]);
    expect(next).toHaveLength(2);
    expect(next[1].severity).toBe("blocking");
  });

  it("removeDraftRow drops the row and clears a stale duplicate mark", () => {
    const a = makeRow({ localId: "a", name: "Цемент" });
    const b = makeRow({ localId: "b", name: "Цемент" });
    const marked = editDraftRow([a, b], "a", { name: "Цемент" });

    const next = removeDraftRow(marked, "b");
    expect(next).toHaveLength(1);
    expect(next[0].issues.some((issue) => issue.code === "NAME_DUPLICATE")).toBe(false);
  });

  it("collectDuplicateNameKeys ignores case and extra spaces", () => {
    const keys = collectDuplicateNameKeys([
      { name: "Песок  речной" },
      { name: "песок речной" },
      { name: "Щебень" },
    ]);
    expect(keys.has("песок речной")).toBe(true);
    expect(keys.has("щебень")).toBe(false);
  });

  it("countBySeverity aggregates rows", () => {
    const counts = countBySeverity([
      makeRow({ severity: "ok" }),
      makeRow({ severity: "warning" }),
      makeRow({ severity: "blocking" }),
      makeRow({ severity: "blocking" }),
    ]);
    expect(counts).toEqual({ blocking: 2, warning: 1, ok: 1 });
  });
});
