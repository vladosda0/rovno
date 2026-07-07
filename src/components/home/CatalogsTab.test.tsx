import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let workspaceKind: "supabase" | "local" = "supabase";
vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () =>
    workspaceKind === "supabase"
      ? { kind: "supabase", profileId: "profile-1" }
      : { kind: "local" },
}));

vi.mock("@/hooks/use-user-catalogs", () => ({
  useUserCatalogs: vi.fn(),
  useAllUserCatalogItems: vi.fn(),
  useRenameUserCatalog: () => ({ mutate: vi.fn() }),
  useDeleteUserCatalog: () => ({ mutate: vi.fn() }),
}));

// The upload modal pulls in the whole upload flow — out of scope here.
vi.mock("@/components/upload/MultiStepUploadModal", () => ({
  MultiStepUploadModal: () => null,
}));

import { CatalogsTab } from "@/components/home/CatalogsTab";
import { useAllUserCatalogItems, useUserCatalogs } from "@/hooks/use-user-catalogs";

const mockCatalogs = useUserCatalogs as unknown as Mock;
const mockItems = useAllUserCatalogItems as unknown as Mock;

function renderCatalogs() {
  return render(
    <MemoryRouter>
      <CatalogsTab />
    </MemoryRouter>,
  );
}

describe("CatalogsTab", () => {
  beforeEach(() => {
    workspaceKind = "supabase";
    mockCatalogs.mockReturnValue({ data: [], isLoading: false });
    mockItems.mockReturnValue({ data: [], isLoading: false });
  });

  it("asks guests to sign in", () => {
    workspaceKind = "local";
    renderCatalogs();
    expect(screen.getByText(/sign in to upload your price list/i)).toBeInTheDocument();
  });

  it("shows the upload empty state when the user has no catalogs", () => {
    renderCatalogs();
    expect(
      screen.getByRole("heading", { name: /upload your first price list/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /upload price list/i }).length).toBeGreaterThan(0);
  });

  it("lists the user's catalogs with item counts", () => {
    mockCatalogs.mockReturnValue({
      data: [
        {
          id: "cat-1",
          name: "Прайс бригады",
          sourceFilename: "прайс.xlsx",
          createdAt: "2026-07-01T10:00:00Z",
          updatedAt: "2026-07-01T10:00:00Z",
        },
      ],
      isLoading: false,
    });
    mockItems.mockReturnValue({
      data: [
        { id: "i1", catalogId: "cat-1" },
        { id: "i2", catalogId: "cat-1" },
      ],
      isLoading: false,
    });
    renderCatalogs();
    expect(screen.getByText("Прайс бригады")).toBeInTheDocument();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });
});
