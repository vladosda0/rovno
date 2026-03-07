import { describe, expect, it } from "vitest";
import {
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
});
