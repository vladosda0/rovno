import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProcurementItem } from "@/data/procurement-store";
import { __unsafeResetInventoryForTests } from "@/data/inventory-store";
import { __unsafeResetOrdersForTests } from "@/data/order-store";
import { fmtCost } from "@/lib/procurement-utils";
import { OrderModal } from "@/components/procurement/OrderModal";

function createTestItem(requiredQty = 10) {
  const projectId = `order-modal-project-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const itemId = `order-modal-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const itemName = `Material ${itemId}`;
  addProcurementItem({
    id: itemId,
    projectId,
    stageId: null,
    categoryId: null,
    type: "material",
    name: itemName,
    spec: null,
    unit: "pcs",
    requiredByDate: null,
    requiredQty,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 100,
    actualUnitPrice: null,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: false,
    sourceEstimateItemId: "estimate-line-1",
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
  return { projectId, itemId, itemName };
}

function renderOpenModal(requiredQty = 10) {
  const { projectId, itemId, itemName } = createTestItem(requiredQty);
  render(
    <OrderModal
      open
      onOpenChange={vi.fn()}
      projectId={projectId}
      initialItemIds={[itemId]}
    />,
  );
  const row = screen.getByText(itemName).closest("tr");
  if (!row) {
    throw new Error("Expected order line row");
  }
  const [qtyInput, actualInput] = within(row).getAllByRole("spinbutton") as HTMLInputElement[];
  return { qtyInput, actualInput };
}

describe("OrderModal", () => {
  beforeEach(() => {
    __unsafeResetOrdersForTests();
    __unsafeResetInventoryForTests();
  });

  it("shows Delivery date and removes Due date from the form", () => {
    renderOpenModal();
    expect(screen.getByText("Delivery date")).toBeInTheDocument();
    expect(screen.queryByText("Due date")).not.toBeInTheDocument();
  });

  it("disables Place order and keeps total at zero while actual prices are invalid", () => {
    renderOpenModal();
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    expect(screen.getByText("Actual price required")).toBeInTheDocument();
    expect(screen.getByText(`Total: ${fmtCost(0)}`)).toBeInTheDocument();
  });

  it("marks invalid actual input and enables Place order only after valid price", () => {
    const { actualInput } = renderOpenModal();
    fireEvent.change(actualInput, { target: { value: "0" } });
    expect(actualInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Actual price required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();

    fireEvent.change(actualInput, { target: { value: "12.5" } });
    expect(actualInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Actual price required")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
    expect(screen.getByText(`Total: ${fmtCost(125)}`)).toBeInTheDocument();
  });

  it("shows under-order warning and hides it immediately when qty matches remaining", () => {
    const { qtyInput, actualInput } = renderOpenModal();
    fireEvent.change(actualInput, { target: { value: "10" } });

    fireEvent.change(qtyInput, { target: { value: "8" } });
    expect(screen.getByText("⚠️ 2 more materials requested")).toBeInTheDocument();
    expect(screen.queryByText(/requested by/)).not.toBeInTheDocument();

    fireEvent.change(qtyInput, { target: { value: "10" } });
    expect(screen.queryByText(/more materials requested/)).not.toBeInTheDocument();
  });
});
