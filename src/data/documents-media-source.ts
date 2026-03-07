import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { Document, DocumentVersion, Media } from "@/types/entities";
import type { Database as DocumentsMediaDatabase } from "../../backend-truth/generated/supabase-types";

type DocumentRow = DocumentsMediaDatabase["public"]["Tables"]["documents"]["Row"];
type DocumentVersionRow = DocumentsMediaDatabase["public"]["Tables"]["document_versions"]["Row"];
type ProjectMediaRow = DocumentsMediaDatabase["public"]["Tables"]["project_media"]["Row"];
type TypedSupabaseClient = SupabaseClient<DocumentsMediaDatabase>;

export interface DocumentsMediaSource {
  mode: WorkspaceMode["kind"];
  getProjectDocuments: (projectId: string) => Promise<Document[]>;
  getProjectMedia: (projectId: string) => Promise<Media[]>;
}

function createBrowserDocumentsMediaSource(mode: WorkspaceMode["kind"]): DocumentsMediaSource {
  return {
    mode,
    async getProjectDocuments(projectId: string) {
      return store.getDocuments(projectId);
    },
    async getProjectMedia(projectId: string) {
      return store.getMedia(projectId);
    },
  };
}

export function mapDocumentVersionRowToDocumentVersion(
  row: DocumentVersionRow,
): DocumentVersion {
  return {
    id: row.id,
    document_id: row.document_id,
    number: row.version_number,
    status: "draft",
    content: "",
  };
}

export function mapDocumentRowToDocument(
  row: DocumentRow,
  versions: DocumentVersion[],
): Document {
  return {
    id: row.id,
    project_id: row.project_id,
    type: row.type,
    title: row.title,
    versions,
    origin: row.origin ?? undefined,
    description: row.description ?? undefined,
    created_at: row.created_at,
    file_meta: undefined,
    ai_flags: undefined,
  };
}

export function shapeDocumentsWithVersions(input: {
  documentRows: DocumentRow[];
  versionRows: DocumentVersionRow[];
}): Document[] {
  const versionsByDocumentId = new Map<string, DocumentVersion[]>();

  for (const row of input.versionRows) {
    const versions = versionsByDocumentId.get(row.document_id) ?? [];
    versions.push(mapDocumentVersionRowToDocumentVersion(row));
    versionsByDocumentId.set(row.document_id, versions);
  }

  for (const versions of versionsByDocumentId.values()) {
    versions.sort((left, right) => left.number - right.number);
  }

  return input.documentRows.flatMap((row) => {
    const versions = versionsByDocumentId.get(row.id) ?? [];
    if (versions.length === 0) {
      return [];
    }

    return [mapDocumentRowToDocument(row, versions)];
  });
}

export function mapProjectMediaRowToMedia(row: ProjectMediaRow): Media {
  return {
    id: row.id,
    project_id: row.project_id,
    task_id: undefined,
    uploader_id: row.uploaded_by ?? "",
    caption: row.caption ?? "",
    description: undefined,
    is_final: false,
    created_at: row.created_at,
    file_meta: undefined,
  };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

function createSupabaseDocumentsMediaSource(
  supabase: TypedSupabaseClient,
): DocumentsMediaSource {
  return {
    mode: "supabase",
    async getProjectDocuments(projectId: string) {
      const { data: documentRows, error: documentsError } = await supabase
        .from("documents")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (documentsError) {
        throw documentsError;
      }

      const rows = documentRows ?? [];
      if (rows.length === 0) {
        return [];
      }

      const documentIds = rows.map((row) => row.id);
      const { data: versionRows, error: versionsError } = await supabase
        .from("document_versions")
        .select("*")
        .in("document_id", documentIds)
        .order("version_number", { ascending: true });

      if (versionsError) {
        throw versionsError;
      }

      return shapeDocumentsWithVersions({
        documentRows: rows,
        versionRows: versionRows ?? [],
      });
    },

    async getProjectMedia(projectId: string) {
      const { data, error } = await supabase
        .from("project_media")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapProjectMediaRowToMedia);
    },
  };
}

export async function getDocumentsMediaSource(
  mode?: WorkspaceMode,
): Promise<DocumentsMediaSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserDocumentsMediaSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseDocumentsMediaSource(supabase);
}
