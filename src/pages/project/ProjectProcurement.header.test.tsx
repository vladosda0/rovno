import { beforeEach, describe, expect, it, vi } from "vitest";
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
            <Route path="/project/:id/procurement/:itemId" element={<ProjectProcurement />} />
            <Route path="/project/:id/procurement/order/:orderId" element={<ProjectProcurement />} />
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
    sourceEstimateItemId: null,
    sourceEstimateV2LineId: "estimate-header-line",
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

function seedLockedRequestedItem(projectId: string) {
  const item = seedRequestedItem(projectId);
  return addProcurementItem({
    ...item,
    id: `${item.id}-locked`,
    name: `${item.name} locked`,
    lockedFromEstimate: true,
    sourceEstimateV2LineId: "estimate-line-locked",
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

    expect(screen.getByText("Procurement will appear here soon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Estimate" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Procurement" })).not.toBeInTheDocument();
  });

  it("renders the pipeline finance header + controls row with count-only tabs", () => {
    const projectId = "project-1";
    seedRequestedItem(projectId);

    renderProjectProcurement(projectId);

    const heading = screen.getByRole("heading", { name: "Procurement" });
    expect(heading).toBeInTheDocument();

    // Anchor cards: one budget basis, the old Planned/Variance KPI grid is gone.
    expect(screen.getByText("Procurement budget")).toBeInTheDocument();
    expect(screen.getByText("Budget left")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(screen.queryByText("Variance")).not.toBeInTheDocument();
    expect(screen.queryByText("Used = Committed + Received")).not.toBeInTheDocument();

    // Funnel legend separates received from in-transit instead of one "used" number.
    expect(screen.getByText("Received:")).toBeInTheDocument();
    expect(screen.getByText("In transit:")).toBeInTheDocument();
    expect(screen.getByText("Left to order:")).toBeInTheDocument();

    // Details accordion stays collapsed by default.
    expect(screen.getByRole("button", { name: /Details/ })).toHaveAttribute("aria-expanded", "false");

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

  it("shows all three tabs for contractors including Requested", () => {
    const projectId = "project-1";
    seedRequestedItem(projectId);
    setAuthRole("contractor");

    renderProjectProcurement(projectId);

    expect(screen.getByRole("button", { name: /^Requested \(/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ordered \(/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^In stock \(/i })).toBeInTheDocument();
  });

  it("hides procurement money header and shows disabled Order for contractors", () => {
    const projectId = "project-1";
    seedRequestedItem(projectId);
    setAuthRole("contractor");

    renderProjectProcurement(projectId);

    expect(screen.queryByText("Procurement budget")).not.toBeInTheDocument();
    expect(screen.queryByText("Budget left")).not.toBeInTheDocument();
    expect(screen.queryByText("Received:")).not.toBeInTheDocument();
    expect(screen.queryByText("In transit:")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Requested \(/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Requested \(/i }));
    const orderBtns = screen.getAllByRole("button", { name: "Order" });
    expect(orderBtns.length).toBeGreaterThan(0);
    orderBtns.forEach((btn) => expect(btn).toBeDisabled());
  });
});
