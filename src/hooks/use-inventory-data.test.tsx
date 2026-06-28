import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as inventoryStore from "@/data/inventory-store";
import * as inventorySource from "@/data/inventory-source";
import { useHomeInventorySnapshot, useInventoryStock, useLocations } from "@/hooks/use-inventory-data";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { InventoryLocation, Project } from "@/types/entities";
import * as store from "@/data/store";
import * as workspaceSource from "@/data/workspace-source";

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

function SnapshotProbe() {
  const snapshot = useHomeInventorySnapshot();
  return (
    <div>
      <span data-testid="snap-loading">{String(snapshot.isLoading)}</span>
      <span data-testid="snap-total">{snapshot.totalRows}</span>
      <span data-testid="snap-projects">
        {snapshot.projects.map((entry) => `${entry.projectTitle}:${entry.rows.length}`).join("|")}
      </span>
    </div>
  );
}

describe("useHomeInventorySnapshot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("groups per-project stock from the browser store in demo/local mode", () => {
    const queryClient = createQueryClient();
    vi.spyOn(store, "getProjects").mockReturnValue([
      { id: "p1", title: "Alpha" },
      { id: "p2", title: "Beta" },
    ] as unknown as Project[]);
    vi.spyOn(inventoryStore, "listStockByProject").mockImplementation((projectId) =>
      projectId === "p1"
        ? [
            { projectId: "p1", locationId: "l1", inventoryKey: "cable|m", qty: 3 },
            { projectId: "p1", locationId: "l1", inventoryKey: "pipe|m", qty: 5 },
          ]
        : [],
    );
    vi.spyOn(inventoryStore, "subscribeInventory").mockReturnValue(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <SnapshotProbe />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("snap-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("snap-total")).toHaveTextContent("2");
    expect(screen.getByTestId("snap-projects")).toHaveTextContent("Alpha:2|Beta:0");
  });

  it("fans out per-project stock in supabase mode, reports loading, and aligns rows by project", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth();
    const queryClient = createQueryClient();

    vi.spyOn(workspaceSource, "getWorkspaceSource").mockResolvedValue({
      getProjects: vi.fn(async () => [
        { id: "p1", title: "Alpha" },
        { id: "p2", title: "Beta" },
      ]),
    } as unknown as Awaited<ReturnType<typeof workspaceSource.getWorkspaceSource>>);

    const getProjectStock = vi.fn(async (projectId: string) =>
      projectId === "p1"
        ? [{ projectId: "p1", locationId: "l1", inventoryKey: "cable|m", qty: 4 }]
        : [],
    );
    vi.spyOn(inventorySource, "getInventorySource").mockResolvedValue({
      mode: "supabase",
      getProjectLocations: vi.fn(),
      createProjectLocation: vi.fn(),
      getProjectStock,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SnapshotProbe />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("snap-loading")).toHaveTextContent("true");

    await waitFor(() => {
      expect(screen.getByTestId("snap-loading")).toHaveTextContent("false");
    });
    expect(screen.getByTestId("snap-total")).toHaveTextContent("1");
    expect(screen.getByTestId("snap-projects")).toHaveTextContent("Alpha:1|Beta:0");
  });
});
