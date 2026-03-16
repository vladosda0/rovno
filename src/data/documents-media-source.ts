import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { Document, DocumentVersion, Media } from "@/types/entities";
import type { Database as DocumentsMediaDatabase } from "../../backend-truth/generated/supabase-types";

type DocumentRow = DocumentsMediaDatabase["public"]["Tables"]["documents"]["Row"];
type DocumentInsert = DocumentsMediaDatabase["public"]["Tables"]["documents"]["Insert"];
type DocumentVersionRow = DocumentsMediaDatabase["public"]["Tables"]["document_versions"]["Row"];
type DocumentVersionInsert = DocumentsMediaDatabase["public"]["Tables"]["document_versions"]["Insert"];
type DocumentVersionUpdate = DocumentsMediaDatabase["public"]["Tables"]["document_versions"]["Update"];
type ProjectMediaRow = DocumentsMediaDatabase["public"]["Tables"]["project_media"]["Row"];
type TypedSupabaseClient = SupabaseClient<DocumentsMediaDatabase>;

export interface CreateProjectDocumentInput {
  projectId: string;
  type: string;
  title: string;
  origin?: Document["origin"];
  description?: string;
  initialVersionContent?: string;
  initialVersionStatus?: DocumentVersion["status"];
}

export interface CreateProjectDocumentVersionInput {
  projectId: string;
  documentId: string;
  content?: string;
  status?: DocumentVersion["status"];
}

export interface ArchiveProjectDocumentInput {
  projectId: string;
  documentId: string;
  content?: string;
}

export interface DeleteProjectDocumentInput {
  projectId: string;
  documentId: string;
}

export interface ProjectDocumentMutationResult {
  documentId: string;
  versionId: string;
  versionNumber: number;
}

export interface DocumentsMediaSource {
  mode: WorkspaceMode["kind"];
  getProjectDocuments: (projectId: string) => Promise<Document[]>;
  getProjectMedia: (projectId: string) => Promise<Media[]>;
  createProjectDocument: (input: CreateProjectDocumentInput) => Promise<ProjectDocumentMutationResult>;
  createProjectDocumentVersion: (input: CreateProjectDocumentVersionInput) => Promise<ProjectDocumentMutationResult>;
  archiveProjectDocument: (input: ArchiveProjectDocumentInput) => Promise<ProjectDocumentMutationResult>;
  deleteProjectDocument: (input: DeleteProjectDocumentInput) => Promise<void>;
}

function createDocumentMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getDocumentForMutation(
  projectId: string,
  documentId: string,
): Document {
  const document = store.getDocuments(projectId).find((entry) => entry.id === documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  return document;
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
    async createProjectDocument(input) {
      const now = new Date().toISOString();
      const documentId = createDocumentMutationId();
      const versionId = createDocumentMutationId();

      store.addDocument({
        id: documentId,
        project_id: input.projectId,
        type: input.type,
        title: input.title,
        origin: input.origin,
        description: input.description,
        created_at: now,
        versions: [{
          id: versionId,
          document_id: documentId,
          number: 1,
          status: input.initialVersionStatus ?? "draft",
          content: input.initialVersionContent ?? "",
        }],
      });

      return {
        documentId,
        versionId,
        versionNumber: 1,
      };
    },
    async createProjectDocumentVersion(input) {
      const document = getDocumentForMutation(input.projectId, input.documentId);
      const versionId = createDocumentMutationId();
      const versionNumber = document.versions.length + 1;

      store.addDocumentVersion(input.documentId, {
        id: versionId,
        document_id: input.documentId,
        number: versionNumber,
        status: input.status ?? "draft",
        content: input.content ?? "",
      });

      return {
        documentId: input.documentId,
        versionId,
        versionNumber,
      };
    },
    async archiveProjectDocument(input) {
      const document = getDocumentForMutation(input.projectId, input.documentId);
      const latestVersion = document.versions[document.versions.length - 1];
      const versionId = createDocumentMutationId();
      const versionNumber = document.versions.length + 1;

      store.addDocumentVersion(input.documentId, {
        id: versionId,
        document_id: input.documentId,
        number: versionNumber,
        status: "archived",
        content: input.content ?? latestVersion?.content ?? "",
      });

      return {
        documentId: input.documentId,
        versionId,
        versionNumber,
      };
    },
    async deleteProjectDocument(input) {
      store.deleteDocument(input.documentId);
    },
  };
}

export function mapDocumentVersionRowToDocumentVersion(
  row: DocumentVersionRow,
  input: {
    hasCurrentVersion: boolean;
    archivedVersionId: string | null;
  },
): DocumentVersion {
  return {
    id: row.id,
    document_id: row.document_id,
    number: row.version_number,
    status: input.archivedVersionId === row.id
      ? "archived"
      : input.hasCurrentVersion && row.is_current
        ? "draft"
        : "draft",
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
  const versionRowsByDocumentId = new Map<string, DocumentVersionRow[]>();

  for (const row of input.versionRows) {
    const versions = versionRowsByDocumentId.get(row.document_id) ?? [];
    versions.push(row);
    versionRowsByDocumentId.set(row.document_id, versions);
  }

  for (const versionRows of versionRowsByDocumentId.values()) {
    versionRows.sort((left, right) => left.version_number - right.version_number);
  }

  return input.documentRows.flatMap((row) => {
    const versionRows = versionRowsByDocumentId.get(row.id) ?? [];
    if (versionRows.length === 0) {
      return [];
    }

    const hasCurrentVersion = versionRows.some((entry) => entry.is_current);
    const archivedVersionId = hasCurrentVersion
      ? null
      : versionRows[versionRows.length - 1]?.id ?? null;
    const versions = versionRows.map((versionRow) => mapDocumentVersionRowToDocumentVersion(
      versionRow,
      {
        hasCurrentVersion,
        archivedVersionId,
      },
    ));

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

async function getDocumentVersionRows(
  supabase: TypedSupabaseClient,
  documentId: string,
): Promise<DocumentVersionRow[]> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("version_number", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function clearCurrentDocumentVersions(
  supabase: TypedSupabaseClient,
  documentId: string,
): Promise<void> {
  const update: DocumentVersionUpdate = {
    is_current: false,
  };

  const { error } = await supabase
    .from("document_versions")
    .update(update)
    .eq("document_id", documentId)
    .eq("is_current", true);

  if (error) {
    throw error;
  }
}

export async function createSupabaseProjectDocument(
  supabase: TypedSupabaseClient,
  profileId: string,
  input: CreateProjectDocumentInput,
): Promise<ProjectDocumentMutationResult> {
  const documentId = createDocumentMutationId();
  const versionId = createDocumentMutationId();
  const documentInsert: DocumentInsert = {
    id: documentId,
    project_id: input.projectId,
    type: input.type,
    title: input.title,
    origin: input.origin ?? "manual",
    description: input.description ?? null,
    created_by: profileId,
  };

  const { error: documentError } = await supabase
    .from("documents")
    .insert(documentInsert);

  if (documentError) {
    throw documentError;
  }

  const versionInsert: DocumentVersionInsert = {
    id: versionId,
    document_id: documentId,
    version_number: 1,
    is_current: true,
    created_by: profileId,
  };

  const { error: versionError } = await supabase
    .from("document_versions")
    .insert(versionInsert);

  if (versionError) {
    throw versionError;
  }

  return {
    documentId,
    versionId,
    versionNumber: 1,
  };
}

export async function createSupabaseProjectDocumentVersion(
  supabase: TypedSupabaseClient,
  profileId: string,
  input: CreateProjectDocumentVersionInput,
): Promise<ProjectDocumentMutationResult> {
  const versionRows = await getDocumentVersionRows(supabase, input.documentId);
  if (versionRows.length === 0) {
    throw new Error("Document version history not found.");
  }

  const versionNumber = versionRows[versionRows.length - 1].version_number + 1;
  const versionId = createDocumentMutationId();

  await clearCurrentDocumentVersions(supabase, input.documentId);

  const versionInsert: DocumentVersionInsert = {
    id: versionId,
    document_id: input.documentId,
    version_number: versionNumber,
    is_current: true,
    created_by: profileId,
  };

  const { error } = await supabase
    .from("document_versions")
    .insert(versionInsert);

  if (error) {
    throw error;
  }

  return {
    documentId: input.documentId,
    versionId,
    versionNumber,
  };
}

export async function archiveSupabaseProjectDocument(
  supabase: TypedSupabaseClient,
  profileId: string,
  input: ArchiveProjectDocumentInput,
): Promise<ProjectDocumentMutationResult> {
  const versionRows = await getDocumentVersionRows(supabase, input.documentId);
  if (versionRows.length === 0) {
    throw new Error("Document version history not found.");
  }

  const versionNumber = versionRows[versionRows.length - 1].version_number + 1;
  const versionId = createDocumentMutationId();

  await clearCurrentDocumentVersions(supabase, input.documentId);

  const versionInsert: DocumentVersionInsert = {
    id: versionId,
    document_id: input.documentId,
    version_number: versionNumber,
    is_current: false,
    created_by: profileId,
  };

  const { error } = await supabase
    .from("document_versions")
    .insert(versionInsert);

  if (error) {
    throw error;
  }

  return {
    documentId: input.documentId,
    versionId,
    versionNumber,
  };
}

export async function deleteSupabaseProjectDocument(
  supabase: TypedSupabaseClient,
  input: DeleteProjectDocumentInput,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", input.documentId);

  if (error) {
    throw error;
  }
}

export function createSupabaseDocumentsMediaSource(
  supabase: TypedSupabaseClient,
  profileId: string,
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
    async createProjectDocument(input) {
      return createSupabaseProjectDocument(supabase, profileId, input);
    },
    async createProjectDocumentVersion(input) {
      return createSupabaseProjectDocumentVersion(supabase, profileId, input);
    },
    async archiveProjectDocument(input) {
      return archiveSupabaseProjectDocument(supabase, profileId, input);
    },
    async deleteProjectDocument(input) {
      return deleteSupabaseProjectDocument(supabase, input);
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
  return createSupabaseDocumentsMediaSource(supabase, resolvedMode.profileId);
}

export async function createProjectDocument(
  mode: WorkspaceMode,
  input: CreateProjectDocumentInput,
): Promise<ProjectDocumentMutationResult> {
  const source = await getDocumentsMediaSource(mode);
  return source.createProjectDocument(input);
}

export async function createProjectDocumentVersion(
  mode: WorkspaceMode,
  input: CreateProjectDocumentVersionInput,
): Promise<ProjectDocumentMutationResult> {
  const source = await getDocumentsMediaSource(mode);
  return source.createProjectDocumentVersion(input);
}

export async function archiveProjectDocument(
  mode: WorkspaceMode,
  input: ArchiveProjectDocumentInput,
): Promise<ProjectDocumentMutationResult> {
  const source = await getDocumentsMediaSource(mode);
  return source.archiveProjectDocument(input);
}

export async function deleteProjectDocument(
  mode: WorkspaceMode,
  input: DeleteProjectDocumentInput,
): Promise<void> {
  const source = await getDocumentsMediaSource(mode);
  return source.deleteProjectDocument(input);
}
