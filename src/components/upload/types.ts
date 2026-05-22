export type UploadType = "document" | "catalog" | "estimate_template" | "visitka";
export type UploadScope = "personal" | "org" | "project" | "public";

export interface UploadResult {
  type: UploadType;
  scope: UploadScope;
  /** Set for document/catalog/estimate_template saves. */
  documentId?: string;
  /** Set for the visitka flow. */
  orgId?: string;
  profileId?: string;
}

/** Scopes offered for each upload type, in display order. */
const SCOPES_BY_TYPE: Record<UploadType, UploadScope[]> = {
  document: ["personal", "org", "project"],
  catalog: ["personal", "org", "project", "public"],
  estimate_template: ["personal", "org", "project", "public"],
  // Visitka skips Step 2 entirely; it is always Public after moderation.
  visitka: ["public"],
};

export function scopesForType(type: UploadType): UploadScope[] {
  return SCOPES_BY_TYPE[type];
}

export function isScopeValidForType(type: UploadType, scope: UploadScope): boolean {
  return SCOPES_BY_TYPE[type].includes(scope);
}

/** Public upload is only meaningful for catalog and estimate_template. */
export function hasPublicScope(type: UploadType): boolean {
  return type === "catalog" || type === "estimate_template";
}

/** The DB type marker written to the document row for pending-ingest uploads. */
export const PENDING_INGEST_TYPE: Record<"catalog" | "estimate_template", string> = {
  catalog: "catalog_pending_ingest",
  estimate_template: "estimate_template_pending_ingest",
};

/** Estimate-template scope tags — mirrors estimate_templates.scope CHECK in rovno-db. */
export const ESTIMATE_TEMPLATE_SCOPE_TAGS = [
  "ИЖС",
  "ремонт",
  "ландшафт",
  "баня",
  "гараж",
  "инженерка",
  "коммерческое",
  "general",
] as const;
