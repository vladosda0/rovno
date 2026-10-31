import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const activeOrgRole = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/hooks/use-orgs", () => ({
  useActiveOrg: () => (activeOrgRole.value ? { id: "o1", role: activeOrgRole.value } : null),
  useUserOrganizations: () => ({ data: [] }),
}));
vi.mock("@/components/upload/MultiStepUploadModal", () => ({
  MultiStepUploadModal: () => null,
}));

import { markFeatureOpened } from "@/lib/new-features";
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
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("leaves the knowledge base reading page when another section is picked", async () => {
    renderHub("/home?docTab=knowledge-base&kbDoc=sp-71-13330");
    const docTemplatesButton = await screen.findByRole("button", { name: /Document templates/i });
    fireEvent.click(docTemplatesButton);
    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toBe("?docTab=document-templates");
    });
  });
  it("marks the knowledge base as New until it is opened, and the mark stays gone after a remount", async () => {
    markFeatureOpened("contractor-card");
    const first = renderHub("/home");
    const kbButton = await screen.findByRole("button", { name: /Knowledge base/i });
    expect(within(kbButton).getByText("New")).toBeInTheDocument();
    // Closed mobile section list carries the dot while the knowledge base is unopened.
    expect(screen.getByText("has something new")).toBeInTheDocument();

    fireEvent.click(kbButton);
    await waitFor(() => {
      expect(screen.getByTestId("stub-knowledge-base")).toBeInTheDocument();
    });
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.queryByText("has something new")).not.toBeInTheDocument();

    first.unmount();
    renderHub("/home");
    await screen.findByRole("button", { name: /Knowledge base/i });
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.queryByText("has something new")).not.toBeInTheDocument();
  });

  it("gives a member no create button on the card leaf", async () => {
    activeOrgRole.value = "member";
    renderHub("/home?docTab=org-contractor-card");
    await screen.findByTestId("stub-org-contractor-card");
    expect(screen.queryByRole("button", { name: "Create business card" })).not.toBeInTheDocument();
    activeOrgRole.value = null;
  });

  it("gives an owner the create button on the card leaf", async () => {
    activeOrgRole.value = "owner";
    renderHub("/home?docTab=org-contractor-card");
    await screen.findByTestId("stub-org-contractor-card");
    expect(screen.getAllByRole("button", { name: "Create business card" }).length).toBeGreaterThan(0);
    activeOrgRole.value = null;
  });

  it("clears the New mark when the knowledge base is reached by a link", async () => {
    renderHub("/home?docTab=knowledge-base");
    await waitFor(() => {
      expect(screen.getByTestId("stub-knowledge-base")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
  });
});
