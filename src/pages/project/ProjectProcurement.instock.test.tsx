import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProjectProcurement from "@/pages/project/ProjectProcurement";
import { addProcurementItem } from "@/data/procurement-store";
import {
  __unsafeResetOrdersForTests,
  createDraftOrder,
  getOrder,
  placeOrder,
  receiveOrder,
} from "@/data/order-store";
import {
  __unsafeResetInventoryForTests,
  adjustStock,
  createLocation,
  ensureDefaultLocation,
} from "@/data/inventory-store";
import { toInventoryKey } from "@/lib/procurement-fulfillment";
import { getEvents, getTasks } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import {
  createLine,
  createStage,
  createWork,
  getEstimateV2ProjectState,
  setProjectEstimateStatus,
} from "@/data/estimate-v2-store";

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

function ensureLinkedEstimateLine(projectId: string) {
  let linkedLineId = getEstimateV2ProjectState(projectId).lines[0]?.id ?? null;
  if (!linkedLineId) {
    const stage = createStage(projectId, { title: "Linked stage" });
    const work = stage ? createWork(projectId, { stageId: stage.id, title: "Linked work" }) : null;
    const line = stage && work ? createLine(projectId, {
      stageId: stage.id,
      workId: work.id,
      title: "Linked material",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 9_000,
    }) : null;
    linkedLineId = line?.id ?? null;
  }
  return linkedLineId;
}

function addStockItem(projectId: string, overrides?: {
  name?: string;
  type?: "material" | "tool" | "other";
  linkEstimate?: boolean;
}) {
  const linkedLineId = overrides?.linkEstimate ? ensureLinkedEstimateLine(projectId) : null;

  const itemId = `in-stock-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return addProcurementItem({
    id: itemId,
    projectId,
    stageId: null,
    categoryId: null,
    type: overrides?.type ?? "material",
    name: overrides?.name ?? `In-stock item ${itemId}`,
    spec: "Spec",
    unit: "pcs",
    requiredByDate: "2026-02-10T00:00:00.000Z",
    requiredQty: 30,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 100,
    actualUnitPrice: 120,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: false,
    sourceEstimateItemId: null,
    sourceEstimateV2LineId: linkedLineId,
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

function seedSupplierInStock(projectId: string, name: string, options?: { linkEstimate?: boolean }) {
  const item = addStockItem(projectId, { name, type: "material", linkEstimate: options?.linkEstimate === true });
  const site = ensureDefaultLocation(projectId);

  const draft = createDraftOrder({
    projectId,
    kind: "supplier",
    supplierName: "Supplier",
    deliverToLocationId: site.id,
    invoiceAttachment: {
      id: `invoice-${item.id}`,
      url: "https://example.com/invoice.pdf",
      type: "application/pdf",
      name: "Invoice.pdf",
      createdAt: new Date().toISOString(),
    },
    lines: [{ procurementItemId: item.id, qty: 8, unit: "pcs", plannedUnitPrice: 100, actualUnitPrice: 120 }],
  });
  placeOrder(draft.id);

  const lineId = getOrder(draft.id)?.lines[0]?.id;
  if (!lineId) throw new Error("Missing order line id");
  receiveOrder(draft.id, { locationId: site.id, lines: [{ lineId, qty: 8 }] });

  return { item, site };
}

function seedStockMoveIn(projectId: string, name: string) {
  const item = addStockItem(projectId, { name, type: "tool" });
  const site = ensureDefaultLocation(projectId);
  const warehouse = createLocation(projectId, { name: "Warehouse" });

  adjustStock(projectId, site.id, toInventoryKey(item), 10);

  const draft = createDraftOrder({
    projectId,
    kind: "stock",
    fromLocationId: site.id,
    toLocationId: warehouse.id,
    deliverToLocationId: warehouse.id,
    invoiceAttachment: {
      id: `consignment-${item.id}`,
      url: "https://example.com/consignment-note.pdf",
      type: "application/pdf",
      name: "Consignment note.pdf",
      createdAt: new Date().toISOString(),
    },
    lines: [{ procurementItemId: item.id, qty: 4, unit: "pcs", plannedUnitPrice: 100, actualUnitPrice: 120 }],
  });
  placeOrder(draft.id);

  return { item, site, warehouse };
}

describe("ProjectProcurement In stock tab", () => {
  beforeEach(() => {
    __unsafeResetOrdersForTests();
    __unsafeResetInventoryForTests();
    window.sessionStorage.clear();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
    setProjectEstimateStatus("project-1", "in_work", { skipSetup: true });
  });

  it("shows minimal columns and creates 'Request more' task with prefilled fields", () => {
    const projectId = "project-1";
    const { item, site } = seedSupplierInStock(projectId, `Minimal columns ${Date.now()}`);
    const beforeTaskCount = getTasks(projectId).length;

    renderProjectProcurement(projectId);
    fireEvent.click(screen.getByRole("button", { name: /^In stock \(/i }));

    const table = screen.getByRole("table");
    const tableScope = within(table);

    expect(tableScope.getByText("Name / Spec")).toBeInTheDocument();
    expect(tableScope.getByText("Location")).toBeInTheDocument();
    expect(tableScope.getByText("Qty available")).toBeInTheDocument();
    expect(tableScope.getByText("Date last received")).toBeInTheDocument();
    expect(tableScope.getByText("Actions")).toBeInTheDocument();

    expect(tableScope.queryByText("When needed")).not.toBeInTheDocument();
    expect(tableScope.queryByText("Delivery scheduled")).not.toBeInTheDocument();
    expect(tableScope.queryByText("Price")).not.toBeInTheDocument();
    expect(tableScope.queryByText("Planned")).not.toBeInTheDocument();
    expect(tableScope.queryByText("Factual")).not.toBeInTheDocument();
    expect(tableScope.queryByText("Status")).not.toBeInTheDocument();

    const itemNameCell = tableScope.getByText(item.name);
    const row = itemNameCell.closest("tr");
    expect(row).toBeTruthy();
    if (!row) return;

    expect(within(row).getByText("Material")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Request more" }));

    const afterTasks = getTasks(projectId);
    expect(afterTasks.length).toBe(beforeTaskCount + 1);
    const createdTask = afterTasks.find((task) => task.title === `Procure more: ${item.name}`);
    expect(createdTask).toBeTruthy();
    expect(createdTask?.assignee_id).toBe("user-1");
    expect(createdTask?.stage_id).toBe("stage-1-2");
    expect(createdTask?.description).toContain(`Location: ${site.name}`);
    expect(createdTask?.description).toContain(`Qty available: 8 ${item.unit}`);
    expect(createdTask?.description).toContain(`/project/${projectId}/procurement/${item.id}`);
  });

  it("supports bulk partial Use from sticky bar and emits stock-used AI sidebar event", () => {
    const projectId = "project-1";
    const { item } = seedSupplierInStock(projectId, `Use stock ${Date.now()}`);

    renderProjectProcurement(projectId);
    fireEvent.click(screen.getByRole("button", { name: /^In stock \(/i }));

    const table = screen.getByRole("table");
    const row = within(table).getByText(item.name).closest("tr");
    expect(row).toBeTruthy();
    if (!row) return;

    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use (1)" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(`Quantity to use now for ${item.name}`), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Manual name"), { target: { value: "Crew lead" } });
    fireEvent.change(within(dialog).getByLabelText("Note"), { target: { value: "Installed on site" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Use" }));

    expect(within(table).getByText("5 pcs")).toBeInTheDocument();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();

    const stockUsedEvent = getEvents(projectId).find((event) => (
      event.type === "procurement_updated"
      && event.object_id === item.id
      && (event.payload as Record<string, unknown>).sidebarKind === "stock_used"
    ));
    expect(stockUsedEvent).toBeTruthy();
    expect((stockUsedEvent?.payload as Record<string, unknown>).summary).toBe(`Used 3 pcs of ${item.name} at To the site`);
  });

  it("shows receipt docs and source location in stock details modal", () => {
    const projectId = "project-1";
    const { item, site, warehouse } = seedStockMoveIn(projectId, `Stock move ${Date.now()}`);

    renderProjectProcurement(projectId);
    fireEvent.click(screen.getByRole("button", { name: /^In stock \(/i }));

    const table = screen.getByRole("table");
    const row = within(table).getByText(item.name).closest("tr");
    expect(row).toBeTruthy();
    if (!row) return;

    expect(within(row).getByText(warehouse.name)).toBeInTheDocument();
    const detailsButton = within(row).getByText(item.name).closest("button");
    expect(detailsButton).toBeTruthy();
    if (!detailsButton) return;
    fireEvent.click(detailsButton);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Stock details")).toBeInTheDocument();
    expect(within(dialog).getByText("Receipt history")).toBeInTheDocument();
    expect(within(dialog).getByText(`Source location: ${site.name}`)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Consignment note.pdf" })).toBeInTheDocument();
  });

  it("shows receiver and disabled actions without monetary column in contractor summary mode", () => {
    const projectId = "project-1";
    seedSupplierInStock(projectId, `Summary mode ${Date.now()}`, { linkEstimate: true });
    setAuthRole("contractor");

    renderProjectProcurement(projectId);
    fireEvent.click(screen.getByRole("button", { name: /^In stock \(/i }));

    const table = screen.getByRole("table");
    const tableScope = within(table);
    expect(tableScope.getByText("Receiver")).toBeInTheDocument();
    expect(tableScope.queryByText("Client price")).not.toBeInTheDocument();
    expect(tableScope.getByText("Actions")).toBeInTheDocument();
    expect(tableScope.queryByText(/₽/)).not.toBeInTheDocument();

    const useBtn = tableScope.getByRole("button", { name: "Use" });
    expect(useBtn).toBeDisabled();
    const requestMoreBtn = tableScope.getByRole("button", { name: "Request more" });
    expect(requestMoreBtn).toBeDisabled();
  });

  it("falls back to stock snapshot rows for contractor summary mode when procurement items are hidden", async () => {
    const projectId = "project-1";
    const site = ensureDefaultLocation(projectId);
    adjustStock(projectId, site.id, "fallback cable||m", 6);
    setAuthRole("contractor");

    renderProjectProcurement(projectId);

    expect(screen.queryByText("No procurement items")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^In stock \(/i }));

    const table = await screen.findByRole("table");
    const tableScope = within(table);
    expect(tableScope.getByText("fallback cable")).toBeInTheDocument();
    expect(tableScope.getByText(site.name)).toBeInTheDocument();
    expect(tableScope.getByText("6 m")).toBeInTheDocument();
  });
});
