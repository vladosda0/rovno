import type {
  CatalogUploadDraft,
  DraftRow,
  ParsePriceListSuccess,
} from "@/types/user-catalog";
import { formatCentsAsPriceInput } from "@/lib/user-catalog/validation";

/**
 * Upload-review drafts live in localStorage keyed by uploadId (spec Q6:
 * localStorage over a backend draft table for v1). The review URL
 * /home/catalogs/upload-review/<uploadId> is bookmarkable on the same
 * browser; nothing is persisted server-side until "Сохранить каталог".
 */

const STORAGE_PREFIX = "rovno.catalog-upload-draft.";
const DRAFT_VERSION = 1;

function storageKey(uploadId: string): string {
  return `${STORAGE_PREFIX}${uploadId}`;
}

export function saveCatalogDraft(draft: CatalogUploadDraft): boolean {
  try {
    localStorage.setItem(storageKey(draft.uploadId), JSON.stringify(draft));
    return true;
  } catch {
    // Quota exceeded or storage unavailable — the editor keeps working from
    // memory; only resume-after-close is lost.
    return false;
  }
}

export function loadCatalogDraft(uploadId: string): CatalogUploadDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(uploadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogUploadDraft;
    if (parsed?.version !== DRAFT_VERSION || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function removeCatalogDraft(uploadId: string): void {
  try {
    localStorage.removeItem(storageKey(uploadId));
  } catch {
    // ignore
  }
}

export function defaultCatalogName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base || "Мой прайс-лист";
}

export function buildDraftFromParse(
  uploadId: string,
  parse: ParsePriceListSuccess,
): CatalogUploadDraft {
  const rows: DraftRow[] = parse.rows.map((row) => ({
    localId: crypto.randomUUID(),
    name: row.name,
    unit: row.unit,
    priceInput:
      row.priceCents !== null ? formatCentsAsPriceInput(row.priceCents) : row.priceRaw,
    resourceType: row.resourceType,
    typeAutoFilled: row.typeAutoFilled,
    supplierSku: row.supplierSku,
    matchedArticleId: null,
    matchedArticleName: null,
    sourceRowNumber: row.sourceRowNumber,
    issues: row.issues,
    severity: row.severity,
  }));

  return {
    version: 1,
    uploadId,
    fileName: parse.fileName,
    createdAt: new Date().toISOString(),
    catalogName: defaultCatalogName(parse.fileName),
    totalDataRows: parse.totalDataRows,
    truncated: parse.truncated,
    rows,
  };
}
