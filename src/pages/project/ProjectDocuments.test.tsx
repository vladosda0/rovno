import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDocuments from "@/pages/project/ProjectDocuments";
import type { Document } from "@/types/entities";

const {
  mockUseCurrentUser,
  mockUseProject,
  mockUseWorkspaceMode,
  mockUseProjectDocumentsState,
  mockUseProjectDocumentMutations,
  mockUseDocumentUploadMutations,
  mockUsePermission,
} = vi.hoisted(() => ({
  mockUseCurrentUser: vi.fn(),
  mockUseProject: vi.fn(),
  mockUseWorkspaceMode: vi.fn(),
  mockUseProjectDocumentsState: vi.fn(),
  mockUseProjectDocumentMutations: vi.fn(),
  mockUseDocumentUploadMutations: vi.fn(),
  mockUsePermission: vi.fn(),
}));

vi.mock("@/hooks/use-mock-data", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
  useProject: () => mockUseProject(),
  useWorkspaceMode: () => mockUseWorkspaceMode(),
}));

vi.mock("@/hooks/use-documents-media-source", () => ({
  useProjectDocumentsState: (projectId: string) => mockUseProjectDocumentsState(projectId),
  useProjectDocumentMutations: (projectId: string) => mockUseProjectDocumentMutations(projectId),
  useDocumentUploadMutations: (projectId: string) => mockUseDocumentUploadMutations(projectId),
}));

vi.mock("@/lib/permissions", () => ({
  isOwnerOrCoOwner: (role: string) => role === "owner" || role === "co_owner",
  usePermission: (projectId: string) => mockUsePermission(projectId),
}));

function createDocument(partial: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    project_id: "project-1",
    type: "specification",
    title: "Document One",
    created_at: "2026-03-16T10:00:00.000Z",
    versions: [{
      id: "version-1",
      document_id: "doc-1",
      number: 1,
      status: "draft",
      content: "Document body",
    }],
    ...partial,
  };
}

function renderProjectDocuments() {
  return render(
    <MemoryRouter initialEntries={["/project/project-1/documents"]}>
      <Routes>
        <Route path="/project/:id/documents" element={<ProjectDocuments />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectDocuments", () => {
  beforeEach(() => {
    mockUseCurrentUser.mockReset();
    mockUseProject.mockReset();
    mockUseWorkspaceMode.mockReset();
    mockUseProjectDocumentsState.mockReset();
    mockUseProjectDocumentMutations.mockReset();
    mockUseDocumentUploadMutations.mockReset();
    mockUsePermission.mockReset();
    mockUseCurrentUser.mockReturnValue({ id: "user-1" });
    mockUseProject.mockReturnValue({ project: { title: "Apartment Renovation" } });
    mockUsePermission.mockReturnValue({ role: "owner", can: () => true });
    mockUseProjectDocumentMutations.mockReturnValue({
      createDocument: vi.fn(),
      archiveDocument: vi.fn(),
      deleteDocument: vi.fn(),
    });
    mockUseDocumentUploadMutations.mockReturnValue({
      prepareUpload: vi.fn(),
      uploadBytes: vi.fn(),
      finalizeUpload: vi.fn(),
    });
  });

  it("opens the upload dialog from the empty state", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "local" });
    mockUseProjectDocumentsState.mockReturnValue({ documents: [], isLoading: false });

    renderProjectDocuments();

    const emptyState = screen.getByText("No documents").closest("div");
    expect(emptyState).toBeTruthy();
    if (!emptyState) return;

    fireEvent.click(within(emptyState).getByRole("button", { name: "Upload" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Upload document")).toBeInTheDocument();
  });

  it("shows a skeleton while Supabase documents are loading without flashing the empty state", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "user-1" });
    mockUseProjectDocumentsState.mockReturnValue({ documents: [], isLoading: true });

    renderProjectDocuments();

    expect(screen.getByTestId("documents-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("No documents")).not.toBeInTheDocument();
    expect(screen.getByText("Loading documents...")).toBeInTheDocument();
  });

  it("hides document type, status, and versioning controls in the list UI", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "local" });
    mockUseProjectDocumentsState.mockReturnValue({
      documents: [createDocument({ title: "Local Document" })],
      isLoading: false,
    });

    renderProjectDocuments();

    expect(screen.getByText("Local Document")).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    expect(screen.queryByText("specification")).not.toBeInTheDocument();
    expect(screen.queryByTitle("New version")).not.toBeInTheDocument();
  });

  it("shows print plus disabled download and share actions for Supabase preview", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "user-1" });
    mockUseProjectDocumentsState.mockReturnValue({
      documents: [createDocument({
        title: "Supabase Document",
        versions: [{
          id: "version-1",
          document_id: "doc-1",
          number: 1,
          status: "draft",
          content: "",
        }],
      })],
      isLoading: false,
    });

    renderProjectDocuments();

    fireEvent.click(screen.getByRole("button", { name: "Supabase Document" }));

    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    expect(screen.getByText("Download and sharing are coming soon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Comment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm acknowledgement/i })).not.toBeInTheDocument();
  });
});
