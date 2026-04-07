import type { InternalDocsVisibility, Member, MemberRole } from "@/types/entities";

/**
 * Mirrors `public.effective_internal_docs_visibility` (see rovno-db migration
 * 20260325100000_sensitive_visibility_and_document_classification.sql).
 * Used for UI gating only; backend RLS/triggers remain authoritative.
 */
export function effectiveInternalDocsVisibilityFromMembership(input: {
  role: MemberRole;
  internalDocsVisibility?: InternalDocsVisibility | null;
}): InternalDocsVisibility {
  if (input.role === "owner") {
    return "edit";
  }
  if (input.role === "co_owner") {
    const raw = input.internalDocsVisibility ?? "none";
    if (raw === "none") {
      return "view";
    }
    return raw;
  }
  return input.internalDocsVisibility ?? "none";
}

export function effectiveInternalDocsVisibilityForSeam(membership: Member | null): InternalDocsVisibility | null {
  if (!membership) {
    return null;
  }
  return effectiveInternalDocsVisibilityFromMembership({
    role: membership.role,
    internalDocsVisibility: membership.internal_docs_visibility,
  });
}

/** Matches `public.can_view_internal_documents`: view or edit effective level. */
export function canViewInternalDocuments(effective: InternalDocsVisibility | null): boolean {
  if (effective == null) {
    return false;
  }
  return effective === "view" || effective === "edit";
}
