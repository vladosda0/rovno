import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as inventorySource from "@/data/inventory-source";
import * as ordersSource from "@/data/orders-source";
import { addProcurementItem } from "@/data/procurement-store";
import * as procurementSource from "@/data/procurement-source";
import { __unsafeResetInventoryForTests } from "@/data/inventory-store";
import { __unsafeResetOrdersForTests } from "@/data/order-store";
import { fmtCost } from "@/lib/procurement-utils";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import { __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";
import { OrderModal } from "@/components/procurement/OrderModal";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      // Minimal chainable mock that supports the common supabase query patterns used
      // by other hooks imported in OrderModal (estimate/procurement/etc).
      const emptyRows = { data: [], error: null };
      const emptySingle = { data: null, error: null };

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        is: () => builder,
        limit: () => builder,
        update: () => builder,
        insert: () => builder,
        upsert: () => builder,
        delete: () => builder,
        maybeSingle: () => Promise.resolve(emptySingle),
        single: () => Promise.resolve(emptySingle),
        then: (onFulfilled: any, onRejected: any) => Promise.resolve(emptyRows).then(onFulfilled, onRejected),
        catch: (onRejected: any) => Promise.resolve(emptyRows).catch(onRejected),
      };

      return builder;
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

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
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <OrderModal
        open
        onOpenChange={vi.fn()}
        projectId={projectId}
        initialItemIds={[itemId]}
      />
    </QueryClientProvider>,
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
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "local");
    // Prevent `useRuntimeAuth()` from calling `supabase.auth.getSession()` (network) during this suite.
    // Many tests don't care about auth; they only need deterministic runtime-auth state.
    __unsafeSetRuntimeAuthStateForTests({
      status: "guest",
      session: null,
      user: null,
      profileId: null,
    });
    __unsafeResetOrdersForTests();
    __unsafeResetInventoryForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it("disables stock mode and unsupported supplier fields in Supabase mode", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const { projectId, itemId } = createTestItem();
    const queryClient = createQueryClient();
    authenticateRuntimeAuth();
    vi.spyOn(procurementSource, "getProcurementSource").mockResolvedValue({
      mode: "supabase",
      getProjectProcurementItems: vi.fn().mockResolvedValue([]),
    });
    vi.spyOn(ordersSource, "getOrdersSource").mockResolvedValue({
      mode: "supabase",
      getProjectOrders: vi.fn().mockResolvedValue([]),
      getOrderById: vi.fn().mockResolvedValue(null),
      getPlacedSupplierOrders: vi.fn().mockResolvedValue([]),
      getPlacedSupplierOrdersAllProjects: vi.fn().mockResolvedValue([]),
      createDraftSupplierOrder: vi.fn(),
      placeSupplierOrder: vi.fn(),
      receiveSupplierOrder: vi.fn(),
    });
    vi.spyOn(inventorySource, "getInventorySource").mockResolvedValue({
      mode: "supabase",
      getProjectLocations: vi.fn().mockResolvedValue([]),
      createProjectLocation: vi.fn(),
      getProjectStock: vi.fn().mockResolvedValue([]),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OrderModal
          open
          onOpenChange={vi.fn()}
          projectId={projectId}
          initialItemIds={[itemId]}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Stock allocation stays local-only for now and is disabled in Supabase mode.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Stock" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose at receive time" })).toBeDisabled();
    expect(screen.getByLabelText("Invoice attachment")).toBeDisabled();
    expect(screen.getByPlaceholderText("Optional note")).toBeDisabled();
  });
});
