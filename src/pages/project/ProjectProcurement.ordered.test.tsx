import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { addProcurementItem } from "@/data/procurement-store";
import {
  __unsafeResetOrdersForTests,
  createDraftOrder,
  getOrder,
  placeOrder,
  receiveOrder,
} from "@/data/order-store";
import { __unsafeResetInventoryForTests, ensureDefaultLocation } from "@/data/inventory-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProjectProcurement from "@/pages/project/ProjectProcurement";

function renderProjectProcurement(projectId: string) {
  return render(
    <TooltipProvider delayDuration={0}>
      <MemoryRouter initialEntries={[`/project/${projectId}/procurement`]}>
        <Routes>
          <Route path="/project/:id/procurement" element={<ProjectProcurement />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function seedPartialOrderedLine(projectId: string) {
  const itemId = `ordered-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const item = addProcurementItem({
    id: itemId,
    projectId,
    stageId: null,
    categoryId: null,
    type: "material",
    name: `Ordered item ${itemId}`,
    spec: "Spec",
    unit: "pcs",
    requiredByDate: "2026-02-02T00:00:00.000Z",
    requiredQty: 30,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 100,
    actualUnitPrice: 120,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: false,
    sourceEstimateItemId: "estimate-line-ordered",
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
  const location = ensureDefaultLocation(projectId);
  const draft = createDraftOrder({
    projectId,
    kind: "supplier",
    supplierName: "Supplier",
    deliverToLocationId: location.id,
    lines: [{ procurementItemId: item.id, qty: 30, unit: "pcs", plannedUnitPrice: 100, actualUnitPrice: 120 }],
  });
  placeOrder(draft.id);
  const lineId = getOrder(draft.id)?.lines[0]?.id;
  if (!lineId) throw new Error("Missing order line for test setup");
  receiveOrder(draft.id, { locationId: location.id, lines: [{ lineId, qty: 10 }] });
  return { item };
}

describe("ProjectProcurement Ordered tab", () => {
  beforeEach(() => {
    __unsafeResetOrdersForTests();
    __unsafeResetInventoryForTests();
    window.sessionStorage.clear();
  });

  it("shows Receive action and partial warning tooltip without 'of X' text", async () => {
    const projectId = "project-1";
    seedPartialOrderedLine(projectId);
    renderProjectProcurement(projectId);

    fireEvent.click(screen.getByRole("button", { name: /^Ordered:/i }));

    expect(screen.getByRole("button", { name: "Receive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Received" })).not.toBeInTheDocument();
    expect(screen.queryByText(/of 30/)).not.toBeInTheDocument();

    const partialWarningButton = screen.getByRole("button", { name: "Partial receive details" });
    fireEvent.pointerMove(partialWarningButton);
    fireEvent.mouseEnter(partialWarningButton);
    fireEvent.focus(partialWarningButton);

    const partialTooltipTexts = await screen.findAllByText(/Received 10 out of 30\./i);
    expect(partialTooltipTexts.length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Learn more" })[0]);

    expect(screen.getByRole("button", { name: /^In stock:/i })).toHaveClass("bg-success/15");
    expect(screen.queryByRole("button", { name: "Receive" })).not.toBeInTheDocument();
  });

  it("renders per-line location picker in Receive items modal with create-location flow", async () => {
    const projectId = "project-1";
    seedPartialOrderedLine(projectId);
    renderProjectProcurement(projectId);

    fireEvent.click(screen.getByRole("button", { name: /^Ordered:/i }));
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Receive items")).toBeInTheDocument();

    const locationPickerButton = within(dialog).getAllByRole("button", { name: /to the site/i })[0];
    fireEvent.click(locationPickerButton);

    expect(await screen.findByText("+ Create location")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add location" })).toBeInTheDocument();
  });
});
