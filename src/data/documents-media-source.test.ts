import { describe, expect, it, vi } from "vitest";
import {
  archiveSupabaseProjectDocument,
  createSupabaseProjectDocument,
  createSupabaseProjectDocumentVersion,
  deleteSupabaseProjectDocument,
  mapProjectMediaRowToMedia,
  shapeDocumentsWithVersions,
} from "@/data/documents-media-source";

function documentRow(
  overrides: Partial<Parameters<typeof shapeDocumentsWithVersions>[0]["documentRows"][number]> = {},
) {
  return {
    id: "doc-1",
    project_id: "project-1",
    type: "specification",
    title: "Electrical Specification",
    origin: "uploaded" as const,
    description: "Main scope document",
    created_by: "profile-1",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function documentVersionRow(
  overrides: Partial<Parameters<typeof shapeDocumentsWithVersions>[0]["versionRows"][number]> = {},
) {
  return {
    id: "version-1",
    document_id: "doc-1",
    storage_object_id: null,
    version_number: 1,
    is_current: true,
    created_by: "profile-1",
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function projectMediaRow(
  overrides: Partial<Parameters<typeof mapProjectMediaRowToMedia>[0]> = {},
) {
  return {
    id: "media-1",
    project_id: "project-1",
    storage_object_id: "storage-1",
    uploaded_by: "profile-2",
    media_type: "photo",
    caption: "Before shot",
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function createSupabaseStub(input: {
  documentsTable?: Record<string, unknown>;
  versionsTable?: Record<string, unknown>;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return input.documentsTable;
      }

      if (table === "document_versions") {
        return input.versionsTable;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Parameters<typeof createSupabaseProjectDocument>[0];
}

describe("documents-media-source helpers", () => {
  it("groups document versions into nested frontend documents and omits versionless rows", () => {
    const documents = shapeDocumentsWithVersions({
      documentRows: [
        documentRow({
          id: "doc-with-versions",
          title: "Has Versions",
          origin: "manual",
          description: null,
        }),
        documentRow({
          id: "doc-without-versions",
          title: "Missing Versions",
        }),
      ],
      versionRows: [
        documentVersionRow({
          id: "version-2",
          document_id: "doc-with-versions",
          version_number: 2,
        }),
        documentVersionRow({
          id: "version-1",
          document_id: "doc-with-versions",
          version_number: 1,
        }),
      ],
    });

    expect(documents).toEqual([
      {
        id: "doc-with-versions",
        project_id: "project-1",
        type: "specification",
        title: "Has Versions",
        versions: [
          {
            id: "version-1",
            document_id: "doc-with-versions",
            number: 1,
            status: "draft",
            content: "",
          },
          {
            id: "version-2",
            document_id: "doc-with-versions",
            number: 2,
            status: "draft",
            content: "",
          },
        ],
        origin: "manual",
        description: undefined,
        created_at: "2026-03-01T00:00:00.000Z",
        file_meta: undefined,
        ai_flags: undefined,
      },
    ]);
  });

  it("maps project media rows to the frontend Media contract with safe defaults", () => {
    const media = mapProjectMediaRowToMedia(projectMediaRow({
      uploaded_by: null,
      caption: null,
    }));

    expect(media).toEqual({
      id: "media-1",
      project_id: "project-1",
      task_id: undefined,
      uploader_id: "",
      caption: "",
      description: undefined,
      is_final: false,
      created_at: "2026-03-01T00:00:00.000Z",
      file_meta: undefined,
    });
  });

  it("marks documents with no current version as archived", () => {
    const documents = shapeDocumentsWithVersions({
      documentRows: [
        documentRow({
          id: "doc-archived",
          title: "Archived Document",
        }),
      ],
      versionRows: [
        documentVersionRow({
          id: "version-1",
          document_id: "doc-archived",
          version_number: 1,
          is_current: false,
        }),
        documentVersionRow({
          id: "version-2",
          document_id: "doc-archived",
          version_number: 2,
          is_current: false,
        }),
      ],
    });

    expect(documents).toEqual([
      expect.objectContaining({
        id: "doc-archived",
        versions: [
          expect.objectContaining({ id: "version-1", status: "draft" }),
          expect.objectContaining({ id: "version-2", status: "archived" }),
        ],
      }),
    ]);
  });

  it("persists document create plus initial current version in Supabase mode", async () => {
    const documentsTable = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const versionsTable = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const supabase = createSupabaseStub({ documentsTable, versionsTable });

    const result = await createSupabaseProjectDocument(supabase, "profile-1", {
      projectId: "project-1",
      type: "specification",
      title: "Electrical Specification",
      origin: "uploaded",
    });

    expect(documentsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.documentId,
      project_id: "project-1",
      type: "specification",
      title: "Electrical Specification",
      origin: "uploaded",
      created_by: "profile-1",
    }));
    expect(versionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.versionId,
      document_id: result.documentId,
      version_number: 1,
      is_current: true,
      created_by: "profile-1",
    }));
  });

  it("creates a new current version and clears the previous current version in Supabase mode", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        documentVersionRow({
          id: "version-1",
          document_id: "doc-1",
          version_number: 1,
          is_current: true,
        }),
      ],
      error: null,
    });
    const selectEq = vi.fn(() => ({ order }));
    const currentEq = vi.fn().mockResolvedValue({ error: null });
    const documentEq = vi.fn(() => ({ eq: currentEq }));
    const versionsTable = {
      select: vi.fn(() => ({ eq: selectEq })),
      update: vi.fn(() => ({ eq: documentEq })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const supabase = createSupabaseStub({ versionsTable });

    const result = await createSupabaseProjectDocumentVersion(supabase, "profile-1", {
      projectId: "project-1",
      documentId: "doc-1",
    });

    expect(selectEq).toHaveBeenCalledWith("document_id", "doc-1");
    expect(order).toHaveBeenCalledWith("version_number", { ascending: true });
    expect(versionsTable.update).toHaveBeenCalledWith({ is_current: false });
    expect(documentEq).toHaveBeenCalledWith("document_id", "doc-1");
    expect(currentEq).toHaveBeenCalledWith("is_current", true);
    expect(versionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.versionId,
      document_id: "doc-1",
      version_number: 2,
      is_current: true,
      created_by: "profile-1",
    }));
  });

  it("archives a document by inserting a non-current marker version in Supabase mode", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        documentVersionRow({
          id: "version-1",
          document_id: "doc-1",
          version_number: 1,
          is_current: false,
        }),
        documentVersionRow({
          id: "version-2",
          document_id: "doc-1",
          version_number: 2,
          is_current: true,
        }),
      ],
      error: null,
    });
    const selectEq = vi.fn(() => ({ order }));
    const currentEq = vi.fn().mockResolvedValue({ error: null });
    const documentEq = vi.fn(() => ({ eq: currentEq }));
    const versionsTable = {
      select: vi.fn(() => ({ eq: selectEq })),
      update: vi.fn(() => ({ eq: documentEq })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const supabase = createSupabaseStub({ versionsTable });

    const result = await archiveSupabaseProjectDocument(supabase, "profile-1", {
      projectId: "project-1",
      documentId: "doc-1",
    });

    expect(versionsTable.update).toHaveBeenCalledWith({ is_current: false });
    expect(versionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.versionId,
      document_id: "doc-1",
      version_number: 3,
      is_current: false,
      created_by: "profile-1",
    }));
  });

  it("deletes the document row in Supabase mode", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const documentsTable = {
      delete: vi.fn(() => ({ eq })),
    };
    const supabase = createSupabaseStub({ documentsTable });

    await deleteSupabaseProjectDocument(supabase, {
      projectId: "project-1",
      documentId: "doc-1",
    });

    expect(documentsTable.delete).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", "doc-1");
  });
});
