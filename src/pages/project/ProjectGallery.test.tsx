import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectGallery from "@/pages/project/ProjectGallery";
import type { Media, MemberRole } from "@/types/entities";

const {
  mockUseMedia,
  mockUseTasks,
  mockUseWorkspaceMode,
  mockUsePermission,
  mockGetCurrentUser,
  mockUseMediaUploadMutations,
} = vi.hoisted(() => ({
  mockUseMedia: vi.fn(),
  mockUseTasks: vi.fn(),
  mockUseWorkspaceMode: vi.fn(),
  mockUsePermission: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockUseMediaUploadMutations: vi.fn(),
}));

vi.mock("@/hooks/use-mock-data", () => ({
  useMedia: (projectId: string) => mockUseMedia(projectId),
  useTasks: (projectId: string) => mockUseTasks(projectId),
  useWorkspaceMode: () => mockUseWorkspaceMode(),
}));

vi.mock("@/hooks/use-documents-media-source", () => ({
  useMediaUploadMutations: (projectId: string) => mockUseMediaUploadMutations(projectId),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return {
    ...actual,
    usePermission: (projectId: string) => mockUsePermission(projectId),
  };
});

vi.mock("@/data/store", () => ({
  addMedia: vi.fn(),
  addEvent: vi.fn(),
  getCurrentUser: () => mockGetCurrentUser(),
}));

function createMedia(partial: Partial<Media> = {}): Media {
  return {
    id: "media-1",
    project_id: "project-1",
    uploader_id: "user-1",
    caption: "Kitchen photo",
    is_final: false,
    created_at: "2026-03-16T10:00:00.000Z",
    ...partial,
  };
}

function renderProjectGallery() {
  return render(
    <MemoryRouter initialEntries={["/project/project-1/gallery"]}>
      <Routes>
        <Route path="/project/:id/gallery" element={<ProjectGallery />} />
      </Routes>
    </MemoryRouter>,
  );
}

function buildPermission(role: MemberRole) {
  return {
    seam: {
      projectId: "project-1",
      profileId: "user-1",
      membership: {
        project_id: "project-1",
        user_id: "user-1",
        role,
        viewer_regime: null,
        ai_access: "consult_only",
        finance_visibility: "summary",
        credit_limit: 0,
        used_credits: 0,
      },
      project: undefined,
    },
    role,
    can: () => true,
    isLoading: false,
  };
}

describe("ProjectGallery", () => {
  beforeEach(() => {
    mockUseMedia.mockReset();
    mockUseTasks.mockReset();
    mockUseWorkspaceMode.mockReset();
    mockUsePermission.mockReset();
    mockGetCurrentUser.mockReset();
    mockUseMediaUploadMutations.mockReset();
    mockGetCurrentUser.mockReturnValue({ id: "user-1" });
    mockUseTasks.mockReturnValue([]);
    mockUsePermission.mockReturnValue(buildPermission("owner"));
    mockUseMediaUploadMutations.mockReturnValue({
      prepareUpload: vi.fn(),
      uploadBytes: vi.fn(),
      finalizeUpload: vi.fn(),
    });
  });

  it("shows empty state when no photos exist", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "local" });
    mockUseMedia.mockReturnValue([]);

    renderProjectGallery();

    expect(screen.getByText("No photos yet")).toBeInTheDocument();
  });

  it("renders photo grid when media exists", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "local" });
    mockUseMedia.mockReturnValue([
      createMedia({ id: "m1", caption: "Before shot" }),
      createMedia({ id: "m2", caption: "After shot", is_final: true }),
    ]);

    renderProjectGallery();

    expect(screen.getByText("Gallery")).toBeInTheDocument();
    expect(screen.getByText("2 photos · 1 final")).toBeInTheDocument();
  });

  it("opens the upload dialog", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "local" });
    mockUseMedia.mockReturnValue([createMedia()]);

    renderProjectGallery();

    fireEvent.click(screen.getByRole("button", { name: /Upload/i }));

    expect(screen.getByText("Upload photos")).toBeInTheDocument();
  });

  it("disables the upload button in Supabase mode until a file is selected", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "user-1" });
    mockUseMedia.mockReturnValue([createMedia()]);

    renderProjectGallery();

    fireEvent.click(screen.getByRole("button", { name: /Upload/i }));

    expect(screen.getByText("Upload photos")).toBeInTheDocument();
    const uploadButton = screen.getAllByRole("button", { name: "Upload" }).find(
      (btn) => btn.closest("[role='alertdialog']"),
    );
    expect(uploadButton).toBeDisabled();
  });

  it("hides upload affordances for viewers", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "local" });
    mockUsePermission.mockReturnValue(buildPermission("viewer"));
    mockUseMedia.mockReturnValue([createMedia()]);

    renderProjectGallery();

    expect(screen.queryByRole("button", { name: /^Upload$/i })).not.toBeInTheDocument();
  });
});
