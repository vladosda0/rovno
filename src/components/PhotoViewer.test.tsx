import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PhotoViewer } from "@/components/PhotoViewer";
import type { ContractAction, ContractDomain } from "@/lib/permission-contract-actions";
import { seamResolveActionState } from "@/lib/permissions";
import type { Media } from "@/types/entities";
import type { MemberRole } from "@/types/entities";

const mockUsePermission = vi.fn();
const mockIsAuthenticated = vi.fn();

vi.mock("@/lib/auth-state", () => ({
  isAuthenticated: () => mockIsAuthenticated(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return {
    ...actual,
    usePermission: (projectId: string) => mockUsePermission(projectId),
  };
});

const mockOpenPhotoConsult = vi.fn();
vi.mock("@/lib/photo-consult-store", () => ({
  openPhotoConsult: (ctx: unknown) => mockOpenPhotoConsult(ctx),
}));

vi.mock("@/data/store", () => ({
  getCurrentUser: () => ({
    id: "user-1",
    email: "a@b.c",
    name: "A",
    locale: "en",
    timezone: "UTC",
    plan: "pro",
    credits_free: 10,
    credits_paid: 0,
  }),
  getTask: vi.fn(() => undefined),
  getStage: vi.fn(() => undefined),
  getMedia: vi.fn(() => []),
  updateMedia: vi.fn(),
  deleteMedia: vi.fn(),
  addEvent: vi.fn(),
}));

function buildMedia(over: Partial<Media> = {}): Media {
  return {
    id: "m1",
    project_id: "project-1",
    uploader_id: "user-1",
    caption: "Test",
    is_final: false,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function permStub(role: MemberRole, aiAccess: "none" | "consult_only" | "project_pool" = "project_pool") {
  const seam = {
    projectId: "project-1",
    profileId: "user-1",
    membership: {
      project_id: "project-1",
      user_id: "user-1",
      role,
      ai_access: aiAccess,
      finance_visibility: "detail" as const,
      credit_limit: 100,
      used_credits: 0,
    },
    project: undefined,
  };
  return {
    seam,
    role,
    can: (action: string) => {
      if (action !== "ai.generate") return true;
      if (role === "viewer") return false;
      if (role === "owner" || role === "co_owner") return true;
      return aiAccess === "project_pool";
    },
    isLoading: false,
    actionState: (domain: ContractDomain, action: ContractAction) =>
      seamResolveActionState(seam, domain, action),
  };
}

function renderViewer(photo: Media | null) {
  return render(
    <MemoryRouter initialEntries={["/project/project-1/gallery"]}>
      <Routes>
        <Route
          path="/project/:id/gallery"
          element={(
            <PhotoViewer
              photo={photo}
              open
              onOpenChange={vi.fn()}
              source="gallery"
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhotoViewer — AI Consult entry", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
    mockIsAuthenticated.mockReset();
    mockOpenPhotoConsult.mockReset();
    mockIsAuthenticated.mockReturnValue(true);
    mockUsePermission.mockReturnValue(permStub("owner"));
  });

  it("hides AI Consult when user cannot ai.generate", () => {
    mockUsePermission.mockReturnValue(permStub("contractor", "consult_only"));
    renderViewer(buildMedia());
    expect(screen.queryByRole("button", { name: /AI Consult/i })).not.toBeInTheDocument();
  });

  it("hides AI Consult when not authenticated", () => {
    mockIsAuthenticated.mockReturnValue(false);
    renderViewer(buildMedia());
    expect(screen.queryByRole("button", { name: /AI Consult/i })).not.toBeInTheDocument();
  });

  it("shows AI Consult for owner and opens consult on click", () => {
    renderViewer(buildMedia());
    const btn = screen.getByRole("button", { name: /AI Consult/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mockOpenPhotoConsult).toHaveBeenCalledTimes(1);
  });
});

describe("PhotoViewer — documents/media contract actions", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
    mockIsAuthenticated.mockReturnValue(true);
  });

  it("hides delete and mark-final for contractor (documents_media preset)", () => {
    mockUsePermission.mockReturnValue(permStub("contractor"));
    renderViewer(buildMedia());
    expect(screen.queryByRole("button", { name: /Delete photo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark as final/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unmark as final/i })).not.toBeInTheDocument();
  });

  it("shows mark final and delete for owner", () => {
    mockUsePermission.mockReturnValue(permStub("owner"));
    renderViewer(buildMedia());
    expect(screen.getByRole("button", { name: /Delete photo/i })).toBeInTheDocument();
    const markFinalButtons = screen.getAllByRole("button", { name: /Mark as final/i });
    expect(markFinalButtons.length).toBeGreaterThanOrEqual(1);
  });
});
