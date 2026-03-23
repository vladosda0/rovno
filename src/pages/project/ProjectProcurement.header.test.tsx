import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProjectProcurement from "@/pages/project/ProjectProcurement";
import { addProcurementItem } from "@/data/procurement-store";
import { __unsafeResetOrdersForTests } from "@/data/order-store";
import { __unsafeResetInventoryForTests } from "@/data/inventory-store";
import { setProjectEstimateStatus } from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function renderProjectProcurement(projectId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={[`/project/${projectId}/procurement`]}>
          <Routes>
            <Route path="/project/:id/procurement" element={<ProjectProcurement />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function seedRequestedItem(projectId: string) {
  const itemId = `requested-header-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return addProcurementItem({
    id: itemId,
    projectId,
    stageId: "stage-1-1",
    categoryId: null,
    type: "material",
    name: `Requested header item ${itemId}`,
    spec: "Spec",
    unit: "pcs",
    requiredByDate: "2026-04-10T00:00:00.000Z",
    requiredQty: 5,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 100,
    actualUnitPrice: 120,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: false,
    sourceEstimateItemId: "estimate-header-item",
    sourceEstimateV2LineId: null,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    linkUrl: null,
    notes: null,
    attachments: [],
    createdFrom: "estimate",
    linkedTaskIds: [],
    archived: false,
  });
}

describe("ProjectProcurement header redesign", () => {
  beforeEach(() => {
    __unsafeResetOrdersForTests();
    __unsafeResetInventoryForTests();
    window.sessionStorage.clear();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
    setProjectEstimateStatus("project-1", "in_work", { skipSetup: true });
  });

  it("shows planning gate with estimate CTA before procurement is in work", () => {
    const projectId = "project-1";
    setProjectEstimateStatus(projectId, "planning");

    renderProjectProcurement(projectId);

    expect(screen.getByText("Procurement will open very soon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Estimate" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Procurement" })).not.toBeInTheDocument();
  });

  it("renders KPI header + controls row with count-only tabs", () => {
    const projectId = "project-1";
    seedRequestedItem(projectId);

    renderProjectProcurement(projectId);

    const heading = screen.getByRole("heading", { name: "Procurement" });
    expect(heading).toBeInTheDocument();

    expect(screen.getAllByText("Planned").length).toBeGreaterThan(0);
    expect(screen.getByText("Committed")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.getByText("Variance")).toBeInTheDocument();
    expect(screen.queryByText(/^Actual:/i)).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^Requested \(\d+\)$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ordered \(\d+\)$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^In stock \(\d+\)$/i })).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search by name, spec, supplier...");
    expect(search).toBeInTheDocument();
    expect(
      heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows sticky selection action bar and clears it", () => {
    const projectId = "project-1";
    const seeded = seedRequestedItem(projectId);

    renderProjectProcurement(projectId);

    fireEvent.click(screen.getByRole("button", { name: /^Requested \(/i }));

    const requestedName = screen.getByText(seeded.name);
    const row = requestedName.closest("tr");
    expect(row).toBeTruthy();
    if (!row) return;

    fireEvent.click(within(row).getByRole("checkbox"));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create order (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });
});
