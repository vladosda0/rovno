import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as inventoryStore from "@/data/inventory-store";
import * as inventorySource from "@/data/inventory-source";
import { useInventoryStock, useLocations } from "@/hooks/use-inventory-data";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { InventoryLocation } from "@/types/entities";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function location(partial: Partial<InventoryLocation> = {}): InventoryLocation {
  return {
    id: "location-1",
    name: "To the site",
    address: "",
    isDefault: true,
    ...partial,
  };
}

function InventoryProbe({ projectId }: { projectId: string }) {
  const locations = useLocations(projectId);
  const stockRows = useInventoryStock(projectId);

  return (
    <div>
      <span data-testid="locations-count">{locations.length}</span>
      <span data-testid="stock-count">{stockRows.length}</span>
      <span data-testid="location-names">{locations.map((entry) => entry.name).join("|")}</span>
      <span data-testid="stock-qtys">{stockRows.map((entry) => entry.qty).join("|")}</span>
    </div>
  );
}

describe("inventory read hooks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns inventory-store data in browser modes and reacts to inventory subscriptions", async () => {
    const queryClient = createQueryClient();
    let currentLocations = [location()];
    let currentStockRows = [{ projectId: "project-1", locationId: "location-1", inventoryKey: "cable|m", qty: 2 }];
    const listeners = new Set<() => void>();

    vi.spyOn(inventoryStore, "listLocations").mockImplementation(() => currentLocations);
    vi.spyOn(inventoryStore, "listStockByProject").mockImplementation(() => currentStockRows);
    vi.spyOn(inventoryStore, "subscribeInventory").mockImplementation((callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InventoryProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("locations-count")).toHaveTextContent("1");
    expect(screen.getByTestId("stock-count")).toHaveTextContent("1");
    expect(screen.getByTestId("location-names")).toHaveTextContent("To the site");

    act(() => {
      currentLocations = [location({ id: "location-2", name: "Warehouse", isDefault: false })];
      currentStockRows = [{ projectId: "project-1", locationId: "location-2", inventoryKey: "screws|pcs", qty: 7 }];
      listeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(screen.getByTestId("location-names")).toHaveTextContent("Warehouse");
    });
    expect(screen.getByTestId("stock-qtys")).toHaveTextContent("7");
  });

  it("reads both locations and stock from the Supabase inventory source", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    let resolveLocations: (value: InventoryLocation[]) => void;
    let resolveStockRows: (value: inventoryStore.InventoryStockRow[]) => void;
    const locationsPromise = new Promise<InventoryLocation[]>((resolve) => {
      resolveLocations = resolve;
    });
    const stockRowsPromise = new Promise<inventoryStore.InventoryStockRow[]>((resolve) => {
      resolveStockRows = resolve;
    });
    const listLocationsSpy = vi.spyOn(inventoryStore, "listLocations");
    const listStockSpy = vi.spyOn(inventoryStore, "listStockByProject");
    const source = {
      mode: "supabase" as const,
      getProjectLocations: vi.fn(() => locationsPromise),
      createProjectLocation: vi.fn(),
      getProjectStock: vi.fn(() => stockRowsPromise),
    };

    authenticateRuntimeAuth();
    vi.spyOn(inventorySource, "getInventorySource").mockResolvedValue(source);

    render(
      <QueryClientProvider client={queryClient}>
        <InventoryProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("locations-count")).toHaveTextContent("0");
    expect(screen.getByTestId("stock-count")).toHaveTextContent("0");
    expect(listLocationsSpy).not.toHaveBeenCalled();
    expect(listStockSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveLocations!([location({ name: "Warehouse", isDefault: false })]);
      resolveStockRows!([{ projectId: "project-1", locationId: "location-1", inventoryKey: "cable|m", qty: 5 }]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("locations-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("location-names")).toHaveTextContent("Warehouse");
    expect(screen.getByTestId("stock-qtys")).toHaveTextContent("5");
    expect(source.getProjectLocations).toHaveBeenCalledWith("project-1");
    expect(source.getProjectStock).toHaveBeenCalledWith("project-1");
  });
});
