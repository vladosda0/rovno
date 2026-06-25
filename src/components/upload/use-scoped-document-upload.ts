import { useQueryClient } from "@tanstack/react-query";
import {
  prepareWorkspaceDocumentUpload,
  finalizeWorkspaceDocumentUpload,
  prepareOrgDocumentUpload,
  finalizeOrgDocumentUpload,
  uploadFileToBucket,
  markWorkspaceDocumentPendingPublic,
} from "@/data/org-source";
import { useActiveOrg, orgQueryKeys } from "@/hooks/use-orgs";
import { useDocumentUploadMutations } from "@/hooks/use-documents-media-source";
import type { DocMediaVisibilityClass } from "@/types/entities";
import type { UploadScope } from "@/components/upload/types";

export interface ScopedUploadParams {
  scope: UploadScope;
  file: File;
  title: string;
  type: string;
  description?: string;
  /** Project scope only; defaults to shared_project. */
  visibilityClass?: DocMediaVisibilityClass;
}

export interface ScopedUploadResult {
  documentId: string | null;
}

/**
 * Runs the prepare → upload → finalize intent flow against the right scope
 * target (workspace / org / project). Public scope routes to workspace_documents
 * and flags pending_public_publication so Session 6/7 ingest can publish it.
 *
 * `projectId` is bound at hook-call time (the project mutations hook needs it);
 * pass undefined for non-project forms — the project branch only runs when the
 * caller actually uploads with scope === "project".
 */
export function useScopedDocumentUpload(projectId?: string) {
  const queryClient = useQueryClient();
  const activeOrg = useActiveOrg();
  const projectUpload = useDocumentUploadMutations(projectId ?? "");

  return async function upload(params: ScopedUploadParams): Promise<ScopedUploadResult> {
    const { scope, file, title, type, description, visibilityClass } = params;
    const mimeType = file.type || "application/octet-stream";

    if (scope === "personal" || scope === "public") {
      const intent = await prepareWorkspaceDocumentUpload({
        type,
        title,
        clientFilename: file.name,
        mimeType,
        sizeBytes: file.size,
        description,
      });
      await uploadFileToBucket(intent.bucket, intent.objectPath, file);
      const result = await finalizeWorkspaceDocumentUpload(intent.uploadIntentId, type, title, description);
      if (scope === "public") {
        // Never silently skip the publication flag: surface an error so the
        // caller can retry rather than leaving an un-queued public upload.
        if (!result.workspaceDocumentId) {
          throw new Error("Upload finalized without a document id; cannot flag it for public publication.");
        }
        await markWorkspaceDocumentPendingPublic(result.workspaceDocumentId);
      }
      await queryClient.invalidateQueries({ queryKey: ["workspace_documents"] });
      return { documentId: result.workspaceDocumentId };
    }

    if (scope === "org") {
      if (!activeOrg?.id) throw new Error("No active organization");
      const intent = await prepareOrgDocumentUpload(activeOrg.id, {
        type,
        title,
        clientFilename: file.name,
        mimeType,
        sizeBytes: file.size,
        description,
      });
      await uploadFileToBucket(intent.bucket, intent.objectPath, file);
      await finalizeOrgDocumentUpload(intent.uploadIntentId, type, title, description);
      await queryClient.invalidateQueries({ queryKey: orgQueryKeys.documents(activeOrg.id) });
      return { documentId: null };
    }

    // project
    if (!projectId) throw new Error("No project selected");
    const intent = await projectUpload.prepareUpload({
      type,
      title,
      clientFilename: file.name,
      mimeType,
      sizeBytes: file.size,
      description,
      visibilityClass,
    });
    await projectUpload.uploadBytes(intent.bucket, intent.objectPath, file);
    const result = await projectUpload.finalizeUpload(intent.uploadIntentId);
    await queryClient.invalidateQueries({ queryKey: ["documents-media"] });
    return { documentId: result.documentId };
  };
}
