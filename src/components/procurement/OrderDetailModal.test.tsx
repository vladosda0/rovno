import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderDetailModal } from "@/components/procurement/OrderDetailModal";
import { addProcurementItem } from "@/data/procurement-store";
import {
  __unsafeResetOrdersForTests,
  createDraftOrder,
  getOrder,
  placeOrder,
} from "@/data/order-store";
import { ensureDefaultLocation } from "@/data/inventory-store";
import { clearDemoSession, enterDemoSession } from "@/lib/auth-state";

function renderModal(projectId: string, orderId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailModal
        open
        onOpenChange={() => {}}
        projectId={projectId}
        orderId={orderId}
        showSensitiveDetail={false}
      />
    </QueryClientProvider>,
  );
}

describe("OrderDetailModal", () => {
  beforeEach(() => {
    __unsafeResetOrdersForTests();
    window.sessionStorage.clear();
    clearDemoSession();
    enterDemoSession("project-1");
  });

  it("hides invoice totals and line price columns when showSensitiveDetail is false", () => {
    const projectId = "project-1";
    const itemId = `odm-item-${Date.now()}`;
    addProcurementItem({
      id: itemId,
      projectId,
      stageId: null,
      categoryId: null,
      type: "material",
      name: "Modal detail item",
      spec: "Spec",
      unit: "pcs",
      requiredByDate: null,
      requiredQty: 10,
      orderedQty: 0,
      receivedQty: 0,
      plannedUnitPrice: 50,
      actualUnitPrice: 55,
      supplier: null,
      supplierPreferred: null,
      locationPreferredId: null,
      lockedFromEstimate: false,
      sourceEstimateItemId: null,
      sourceEstimateV2LineId: null,
      orphaned: false,
      orphanedAt: null,
      orphanedReason: null,
      linkUrl: null,
      notes: null,
      attachments: [],
      createdFrom: "manual",
      linkedTaskIds: [],
      archived: false,
    });
    const location = ensureDefaultLocation(projectId);
    const draft = createDraftOrder({
      projectId,
      kind: "supplier",
      supplierName: "Acme Supply",
      deliverToLocationId: location.id,
      lines: [{ procurementItemId: itemId, qty: 2, unit: "pcs", plannedUnitPrice: 50, actualUnitPrice: 55 }],
    });
    placeOrder(draft.id);
    const orderId = draft.id;
    expect(getOrder(orderId)?.lines.length).toBeGreaterThan(0);

    renderModal(projectId, orderId);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Acme Supply")).toBeInTheDocument();
    expect(within(dialog).queryByText("Planned total")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Factual total")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Open value")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/₽/)).not.toBeInTheDocument();

    const table = within(dialog).getByRole("table");
    expect(within(table).queryByText("Planned unit")).not.toBeInTheDocument();
    expect(within(table).queryByText("Factual unit")).not.toBeInTheDocument();
  });
});
