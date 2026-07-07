import type { ResourceLineType } from "@/types/estimate-v2";

/**
 * User Catalog Upload v1 — shared shapes.
 *
 * A user's personal price list lives in rovno-db `user_catalogs` +
 * `user_catalog_items` (owner-only RLS). Until the backend-truth sync PR
 * regenerates the typed contract, access goes through `rawSupabase` with the
 * row types below (same pattern as the T-Bank RPCs).
 */

export interface UserCatalog {
  id: string;
  name: string;
  sourceFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserCatalogItem {
  id: string;
  catalogId: string;
  position: number;
  name: string;
  /** Canonical unit token (pcs, m², hour, …) or the user's free text; may be "". */
  unit: string;
  priceCents: number;
  resourceType: ResourceLineType;
  supplierSku: string | null;
  matchedArticleId: string | null;
}

/** Raw DB rows (snake_case) as returned by rawSupabase. */
export interface UserCatalogRow {
  id: string;
  name: string;
  source_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCatalogItemRow {
  id: string;
  catalog_id: string;
  position: number;
  name: string;
  unit: string;
  price_cents: number;
  resource_type: string;
  supplier_sku: string | null;
  matched_article_id: string | null;
}

// --- upload review (draft) ---------------------------------------------------

export type RowIssueSeverity = "blocking" | "warning";
export type RowSeverity = "ok" | "warning" | "blocking";
export type RowIssueField = "name" | "unit" | "price" | "type" | "sku";

/** Mirrors rovno-db parse-price-list issue codes — keep the two in sync. */
export type RowIssueCode =
  | "NAME_EMPTY"
  | "NAME_TOO_LONG"
  | "NAME_DUPLICATE"
  | "PRICE_UNPARSEABLE"
  | "PRICE_NON_POSITIVE"
  | "UNIT_EMPTY"
  | "UNIT_UNKNOWN"
  | "TYPE_UNKNOWN"
  | "SKU_TOO_LONG"
  | "EXAMPLE_ROW";

export interface RowIssue {
  code: RowIssueCode;
  field: RowIssueField;
  severity: RowIssueSeverity;
}

/** One row of the parse-price-list response. */
export interface ParsedUploadRow {
  index: number;
  sourceRowNumber: number;
  name: string;
  unit: string;
  unitIsCanonical: boolean;
  priceCents: number | null;
  priceRaw: string;
  resourceType: ResourceLineType;
  typeAutoFilled: boolean;
  supplierSku: string;
  issues: RowIssue[];
  severity: RowSeverity;
}

export interface ParsePriceListSuccess {
  ok: true;
  fileName: string;
  totalDataRows: number;
  truncated: boolean;
  rows: ParsedUploadRow[];
}

export type ParsePriceListFailureCode =
  | "EMPTY_FILE"
  | "BAD_HEADERS"
  | "PARSE_FAILED"
  | "TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "UNAUTHORIZED"
  | "BAD_REQUEST";

export interface ParsePriceListFailure {
  ok: false;
  code: ParsePriceListFailureCode | string;
  message?: string;
}

/** Editable row in the upload-review editor (client draft, persisted in localStorage). */
export interface DraftRow {
  /** Stable client id for React keys and edits. */
  localId: string;
  name: string;
  unit: string;
  /** Raw price text as the user sees/edits it ("850", "1 200,50", "договорная"…). */
  priceInput: string;
  resourceType: ResourceLineType;
  typeAutoFilled: boolean;
  supplierSku: string;
  matchedArticleId: string | null;
  matchedArticleName: string | null;
  /** 1-based row number in the source file; null for rows added in the editor. */
  sourceRowNumber: number | null;
  issues: RowIssue[];
  severity: RowSeverity;
}

export interface CatalogUploadDraft {
  version: 1;
  uploadId: string;
  fileName: string;
  createdAt: string;
  catalogName: string;
  totalDataRows: number;
  truncated: boolean;
  rows: DraftRow[];
}
