import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

// Stub every leaf with a simple data-testid div so we can assert which view renders.
vi.mock("@/components/home/documents-hub/leaves/MyAllDocsLeaf", () => ({
  MyAllDocsLeaf: () => <div data-testid="stub-my-all">my all</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/MyNotesView", () => ({
  MyNotesView: () => <div data-testid="stub-my-notes">my notes</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/MyMediaView", () => ({
  MyMediaView: () => <div data-testid="stub-my-media">my media</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/OrgAllDocsView", () => ({
  OrgAllDocsView: () => <div data-testid="stub-org-all">org all</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/OrgProjectsView", () => ({
  OrgProjectsView: () => <div data-testid="stub-org-projects">org projects</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/OrgMediaView", () => ({
  OrgMediaView: () => <div data-testid="stub-org-media">org media</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/OrgEstimatesView", () => ({
  OrgEstimatesView: () => <div data-testid="stub-org-estimates">org estimates</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/OrgCatalogsView", () => ({
  OrgCatalogsView: () => <div data-testid="stub-org-catalogs">org catalogs</div>,
}));
vi.mock("@/components/home/documents-hub/leaves/OrgContractorCardView", () => ({
  OrgContractorCardView: () => <div data-testid="stub-org-contractor-card">org card</div>,
}));
vi.mock("@/components/home/CatalogsTab", () => ({
  CatalogsTab: () => <div data-testid="stub-catalogs">catalogs</div>,
}));
vi.mock("@/components/home/EstimateTemplatesTab", () => ({
  EstimateTemplatesTab: () => <div data-testid="stub-estimates">estimates</div>,
}));
vi.mock("@/components/home/KnowledgeBaseTab", () => ({
  KnowledgeBaseTab: () => <div data-testid="stub-knowledge-base">kb</div>,
}));
vi.mock("@/components/home/DocumentTemplatesTab", () => ({
  DocumentTemplatesTab: () => <div data-testid="stub-document-templates">doc templates</div>,
}));
vi.mock("@/hooks/use-orgs", () => ({
  useActiveOrg: () => null,
  useUserOrganizations: () => ({ data: [] }),
}));
vi.mock("@/components/upload/MultiStepUploadModal", () => ({
  MultiStepUploadModal: () => null,
}));

import { DocumentsHubTab } from "@/components/home/DocumentsHubTab";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderHub(initialPath = "/home") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <TooltipProvider>
          <Routes>
            <Route
              path="/home"
              element={
                <>
                  <DocumentsHubTab />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DocumentsHubTab", () => {
  it("defaults to my-all and clears docTab from the URL", async () => {
    renderHub("/home");
    await waitFor(() => {
      expect(screen.getByTestId("stub-my-all")).toBeInTheDocument();
    });
    expect(screen.getByTestId("location-search").textContent).toBe("");
  });

  it("reads docTab from the URL on mount", async () => {
    renderHub("/home?docTab=estimates");
    await waitFor(() => {
      expect(screen.getByTestId("stub-estimates")).toBeInTheDocument();
    });
  });

  it("strips an unknown docTab value from the URL and falls back to default", async () => {
    renderHub("/home?docTab=bogus&keepMe=1");
    await waitFor(() => {
      expect(screen.getByTestId("stub-my-all")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toBe("?keepMe=1");
    });
  });

  it("updates the URL search param when switching nav items", async () => {
    renderHub("/home");
    // Wait for default leaf to render so the left nav is settled.
    await waitFor(() => {
      expect(screen.getByTestId("stub-my-all")).toBeInTheDocument();
    });
    const docTemplatesButton = screen.getByRole("button", { name: /Document templates/i });
    fireEvent.click(docTemplatesButton);
    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toBe("?docTab=document-templates");
    });
    await waitFor(() => {
      expect(screen.getByTestId("stub-document-templates")).toBeInTheDocument();
    });
  });
});
