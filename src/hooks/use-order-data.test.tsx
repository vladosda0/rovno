import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as orderStore from "@/data/order-store";
import * as ordersSource from "@/data/orders-source";
import {
  useOrder,
  useOrders,
  usePlacedSupplierOrders,
  usePlacedSupplierOrdersAllProjects,
} from "@/hooks/use-order-data";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { OrderWithLines } from "@/types/entities";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function order(partial: Partial<OrderWithLines> = {}): OrderWithLines {
  return {
    id: "order-1",
    projectId: "project-1",
    status: "placed",
    kind: "supplier",
    supplierName: "BuildMart",
    deliverToLocationId: "location-1",
    fromLocationId: null,
    toLocationId: null,
    dueDate: null,
    deliveryDeadline: null,
    invoiceAttachment: null,
    note: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    lines: [],
    receiveEvents: [],
    ...partial,
  };
}

function OrdersProbe({ projectId, orderId }: { projectId: string; orderId: string }) {
  const orders = useOrders(projectId);
  const placedOrders = usePlacedSupplierOrders(projectId);
  const allPlacedOrders = usePlacedSupplierOrdersAllProjects();
  const selectedOrder = useOrder(orderId);

  return (
    <div>
      <span data-testid="orders-count">{orders.length}</span>
      <span data-testid="placed-count">{placedOrders.length}</span>
      <span data-testid="all-placed-count">{allPlacedOrders.length}</span>
      <span data-testid="orders-ids">{orders.map((entry) => entry.id).join("|")}</span>
      <span data-testid="selected-order-id">{selectedOrder?.id ?? ""}</span>
    </div>
  );
}

describe("order read hooks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns order-store data in browser modes and reacts to order subscriptions", async () => {
    const queryClient = createQueryClient();
    let currentOrders = [order({ id: "order-1" })];
    let currentPlacedOrders = [order({ id: "order-1" })];
    let currentAllPlacedOrders = [order({ id: "order-1" })];
    let currentOrder = order({ id: "order-1" });
    const listeners = new Set<() => void>();

    vi.spyOn(orderStore, "listOrdersByProject").mockImplementation(() => currentOrders);
    vi.spyOn(orderStore, "listPlacedSupplierOrders").mockImplementation(() => currentPlacedOrders);
    vi.spyOn(orderStore, "listPlacedSupplierOrdersAllProjects").mockImplementation(() => currentAllPlacedOrders);
    vi.spyOn(orderStore, "getOrder").mockImplementation(() => currentOrder);
    vi.spyOn(orderStore, "subscribeOrders").mockImplementation((callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OrdersProbe projectId="project-1" orderId="order-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("orders-count")).toHaveTextContent("1");
    expect(screen.getByTestId("placed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("all-placed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("selected-order-id")).toHaveTextContent("order-1");

    act(() => {
      currentOrders = [order({ id: "order-2" })];
      currentPlacedOrders = [order({ id: "order-2" })];
      currentAllPlacedOrders = [order({ id: "order-2" })];
      currentOrder = order({ id: "order-2" });
      listeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(screen.getByTestId("orders-ids")).toHaveTextContent("order-2");
    });
    expect(screen.getByTestId("selected-order-id")).toHaveTextContent("order-2");
  });

  it("reads orders, order detail, and placed-order helpers from the Supabase source", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    let resolveProjectOrders: (value: OrderWithLines[]) => void;
    let resolvePlacedProjectOrders: (value: OrderWithLines[]) => void;
    let resolvePlacedAllOrders: (value: OrderWithLines[]) => void;
    let resolveOrderById: (value: OrderWithLines | null) => void;
    const projectOrdersPromise = new Promise<OrderWithLines[]>((resolve) => {
      resolveProjectOrders = resolve;
    });
    const placedProjectOrdersPromise = new Promise<OrderWithLines[]>((resolve) => {
      resolvePlacedProjectOrders = resolve;
    });
    const placedAllOrdersPromise = new Promise<OrderWithLines[]>((resolve) => {
      resolvePlacedAllOrders = resolve;
    });
    const orderByIdPromise = new Promise<OrderWithLines | null>((resolve) => {
      resolveOrderById = resolve;
    });
    const source = {
      mode: "supabase" as const,
      getProjectOrders: vi.fn(() => projectOrdersPromise),
      getOrderById: vi.fn(() => orderByIdPromise),
      getPlacedSupplierOrders: vi.fn(() => placedProjectOrdersPromise),
      getPlacedSupplierOrdersAllProjects: vi.fn(() => placedAllOrdersPromise),
      createDraftSupplierOrder: vi.fn(),
      placeSupplierOrder: vi.fn(),
      receiveSupplierOrder: vi.fn(),
    };

    authenticateRuntimeAuth();
    vi.spyOn(ordersSource, "getOrdersSource").mockResolvedValue(source);

    render(
      <QueryClientProvider client={queryClient}>
        <OrdersProbe projectId="project-1" orderId="order-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("orders-count")).toHaveTextContent("0");
    expect(screen.getByTestId("placed-count")).toHaveTextContent("0");
    expect(screen.getByTestId("all-placed-count")).toHaveTextContent("0");
    expect(screen.getByTestId("selected-order-id")).toHaveTextContent("");

    await act(async () => {
      resolveProjectOrders!([order({ id: "project-order-1" })]);
      resolvePlacedProjectOrders!([order({ id: "placed-order-1" })]);
      resolvePlacedAllOrders!([order({ id: "placed-order-2" })]);
      resolveOrderById!(order({ id: "order-1" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("orders-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("placed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("all-placed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("selected-order-id")).toHaveTextContent("order-1");
    expect(source.getProjectOrders).toHaveBeenCalledWith("project-1", expect.any(String));
    expect(source.getPlacedSupplierOrders).toHaveBeenCalledWith("project-1", expect.any(String));
    expect(source.getPlacedSupplierOrdersAllProjects).toHaveBeenCalledTimes(1);
    expect(source.getOrderById).toHaveBeenCalledWith("order-1");
  });
});
