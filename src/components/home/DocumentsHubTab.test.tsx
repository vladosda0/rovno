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
vi.mock("@/components/home/documents-hub/KbNavContents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/home/documents-hub/KbNavContents")>()),
  KbNavContents: ({ onFolder }: { onFolder: () => void }) => (
    <button type="button" onClick={onFolder}>
      stub folder row
    </button>
  ),
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
  it("marks the knowledge base with a dot while «What changed» is unopened, entering the base keeps it", async () => {
    markFeatureOpened("contractor-card");
    renderHub("/home");
    const kbButton = await screen.findByRole("button", { name: /Knowledge base/i });
    expect(within(kbButton).queryByText("New")).not.toBeInTheDocument();
    expect(within(kbButton).getByText("has something new")).toBeInTheDocument();
    fireEvent.click(kbButton);
    await waitFor(() => expect(screen.getByTestId("stub-knowledge-base")).toBeInTheDocument());
    // The mark goes once the page itself is opened (KnowledgeBaseTab), not with the section.
    expect(within(kbButton).getByText("has something new")).toBeInTheDocument();
    markFeatureOpened("kb-changes");
    await waitFor(() => expect(screen.queryByText("has something new")).not.toBeInTheDocument());
  });

  it("the folder row under a document opened from «What changed» leaves the page too", async () => {
    renderHub("/home?docTab=knowledge-base&kbChanges=1&kbDoc=sp-29-13330");
    fireEvent.click(await screen.findByRole("button", { name: "stub folder row" }));
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe("?docTab=knowledge-base"));
  });

  it("does not treat «What changed» as current while a card opened from it is on screen", async () => {
    renderHub("/home?docTab=knowledge-base&kbChanges=1&kbSolution=poly");
    await screen.findByTestId("stub-knowledge-base");
    const kbButton = screen.getAllByRole("button", { name: /Knowledge base/i }).find((b) => b.closest("aside"))!;
    expect(kbButton).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();
  });

  it("on «What changed» opens «Knowledge base» with a chevron and the page as a row under it (slice 8)", async () => {
    renderHub("/home?docTab=knowledge-base&kbChanges=1");
    await screen.findByTestId("stub-knowledge-base");
    const kbButton = screen.getAllByRole("button", { name: /Knowledge base/i }).find((b) => b.closest("aside"))!;
    expect(kbButton).toHaveAttribute("aria-expanded", "true");
    expect(kbButton).not.toHaveAttribute("aria-current");
    const row = screen.getByText("What changed").closest("[aria-current]") as HTMLElement;
    expect(row).toHaveAttribute("aria-current", "page");
    expect(row.querySelector("svg")).toBeNull();

    fireEvent.click(kbButton);
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe("?docTab=knowledge-base"));
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();
    expect(kbButton).not.toHaveAttribute("aria-expanded");
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

});
