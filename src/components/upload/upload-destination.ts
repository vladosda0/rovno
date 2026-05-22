import type { UploadResult } from "@/components/upload/types";

/**
 * The DocumentsHub leaf (docTab slug) where a completed upload becomes visible.
 * Returns null when there's no hub leaf to show (project docs live on the
 * project page). Used to navigate the user to where their file landed.
 *
 * Catalog/template "pending ingest" uploads are stored as documents in the
 * chosen scope, so they surface in the matching all-documents leaf.
 */
export function leafForUploadResult(result: UploadResult): string | null {
  if (result.type === "visitka") return "org-contractor-card";
  switch (result.scope) {
    case "personal":
    case "public":
      return "my-all";
    case "org":
      return "org-all";
    default:
      return null;
  }
}
