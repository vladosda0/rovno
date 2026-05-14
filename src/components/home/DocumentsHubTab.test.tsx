import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/components/home/MyDocumentsTab", () => ({
  MyDocumentsTab: () => <div data-testid="stub-my-documents">my documents</div>,
}));
vi.mock("@/components/home/CatalogsTab", () => ({
  CatalogsTab: () => <div data-testid="stub-catalogs">catalogs</div>,
}));
vi.mock("@/components/home/EstimateTemplatesTab", () => ({
  EstimateTemplatesTab: () => <div data-testid="stub-estimate-templates">templates</div>,
}));
vi.mock("@/components/home/KnowledgeBaseTab", () => ({
  KnowledgeBaseTab: () => <div data-testid="stub-knowledge-base">kb</div>,
}));
vi.mock("@/components/home/DocumentTemplatesTab", () => ({
  DocumentTemplatesTab: () => <div data-testid="stub-document-templates">doc templates</div>,
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
  it("defaults to My documents and clears docTab from the URL", async () => {
    renderHub("/home");
    await waitFor(() => {
      expect(screen.getByTestId("stub-my-documents")).toBeInTheDocument();
    });
    expect(screen.getByTestId("location-search").textContent).toBe("");
  });

  it("reads docTab from the URL on mount", async () => {
    renderHub("/home?docTab=estimate-templates");
    await waitFor(() => {
      expect(screen.getByTestId("stub-estimate-templates")).toBeInTheDocument();
    });
  });

  it("strips an unknown docTab value from the URL and falls back to default", async () => {
    renderHub("/home?docTab=bogus&keepMe=1");
    await waitFor(() => {
      expect(screen.getByTestId("stub-my-documents")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toBe("?keepMe=1");
    });
  });

  it("updates the URL search param when switching tabs", async () => {
    renderHub("/home");
    const estimateTab = screen.getByRole("tab", { name: /Estimate templates/i });
    fireEvent.pointerDown(estimateTab, { button: 0 });
    fireEvent.mouseDown(estimateTab, { button: 0 });
    fireEvent.click(estimateTab, { button: 0 });
    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toBe("?docTab=estimate-templates");
    });
    const myDocsTab = screen.getByRole("tab", { name: /My documents/i });
    fireEvent.pointerDown(myDocsTab, { button: 0 });
    fireEvent.mouseDown(myDocsTab, { button: 0 });
    fireEvent.click(myDocsTab, { button: 0 });
    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent).toBe("");
    });
  });
});
