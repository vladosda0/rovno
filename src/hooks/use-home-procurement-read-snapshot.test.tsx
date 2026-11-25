import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeProcurementReadSnapshot } from "@/hooks/use-procurement-read-model";
import type { FinanceRowLoadAccess } from "@/lib/permissions";
import { buildProcurementReadProjectSummary } from "@/lib/procurement-read-model";
import type { InventoryLocation, OrderWithLines, ProcurementItemV2 } from "@/types/entities";

const mocks = vi.hoisted(() => ({
  useWorkspaceMode: vi.fn(),
  useWorkspaceProjectsState: vi.fn(),
  useDetailMap: vi.fn(),
  getProjectProcurementItems: vi.fn(),
  getProjectOrders: vi.fn(),
  getProjectLocations: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: mocks.useWorkspaceMode,
  useWorkspaceProjectsState: mocks.useWorkspaceProjectsState,
}));
vi.mock("@/hooks/use-home-sensitive-detail-map", () => ({
  useWorkspaceProjectsSensitiveDetailMap: mocks.useDetailMap,
}));
vi.mock("@/data/procurement-source", () => ({
  getProcurementSource: async () => ({ getProjectProcurementItems: mocks.getProjectProcurementItems }),
}));
vi.mock("@/data/orders-source", () => ({
  getOrdersSource: async () => ({ getProjectOrders: mocks.getProjectOrders }),
}));
vi.mock("@/data/inventory-source", () => ({
  getInventorySource: async () => ({ getProjectLocations: mocks.getProjectLocations }),
}));

function item(projectId: string, id: string): ProcurementItemV2 {
  return {
    id,
    projectId,
    stageId: null,
    categoryId: null,
    type: "material",
    name: `Item ${id}`,
    spec: null,
    unit: "шт",
    requiredByDate: null,
    requiredQty: 3,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 100,
    actualUnitPrice: null,
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
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  } as ProcurementItemV2;
}

function receivedOrder(projectId: string, itemId: string) {
  return {
    id: `${itemId}-order`,
    projectId,
    status: "received",
    kind: "supplier",
    lines: [{ id: `${itemId}-line`, orderId: `${itemId}-order`, procurementItemId: itemId, qty: 3, receivedQty: 0, unit: "шт" }],
    receiveEvents: [],
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function detailMap(access: Record<string, FinanceRowLoadAccess>, isLoading = false) {
  return {
    canViewSensitiveDetailByProjectId: new Map(
      Object.entries(access).map(([id, value]) => [id, value === "full"]),
    ),
    financeAccessByProjectId: new Map(Object.entries(access)),
    isLoading,
  };
}

describe("useHomeProcurementReadSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "profile-1" });
    mocks.useWorkspaceProjectsState.mockReturnValue({
      projects: [
        { id: "project-a", title: "A" },
        { id: "project-b", title: "B" },
        { id: "project-c", title: "C" },
      ],
      isLoading: false,
    });
    mocks.useDetailMap.mockReturnValue(detailMap({
      "project-a": "full",
      "project-b": "none",
      "project-c": "operational_summary",
    }));
    mocks.getProjectProcurementItems.mockImplementation(async (projectId: string) =>
      projectId === "project-c" ? [] : [item(projectId, `${projectId}-1`)]);
    mocks.getProjectOrders.mockResolvedValue([]);
    mocks.getProjectLocations.mockResolvedValue([]);
  });

  it("rolls procurement up from every project's own sources in Supabase mode", async () => {
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.snapshot.totals.totalCount).toBe(2));
    expect(result.current.sensitiveDetailLoading).toBe(false);
    expect(result.current.snapshot.projects.map((project) => project.projectId)).toEqual([
      "project-a",
      "project-b",
    ]);
    expect(result.current.snapshot.totals.requestedCount).toBe(2);
    expect(mocks.getProjectOrders).toHaveBeenCalledWith("project-a", "full");
    expect(mocks.getProjectLocations).toHaveBeenCalledWith("project-b");
  });

  it("loads each project under that project's own finance access and hides money it may not see", async () => {
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.snapshot.totals.totalCount).toBe(2));
    expect(mocks.getProjectProcurementItems).toHaveBeenCalledWith("project-a", "full");
    expect(mocks.getProjectProcurementItems).toHaveBeenCalledWith("project-b", "none");
    expect(mocks.getProjectProcurementItems).toHaveBeenCalledWith("project-c", "operational_summary");
    expect(mocks.getProjectOrders).toHaveBeenCalledWith("project-b", "none");

    const [open, closed] = result.current.snapshot.projects;
    expect(open.requestedTotal).toBe(300);
    expect(closed.requestedTotal).toBe(0);
    expect(closed.rows[0].monetaryVisible).toBe(false);
    expect(result.current.snapshot.totals.requestedTotal).toBe(300);
  });

  it("fetches nothing until the access map has settled", async () => {
    mocks.useDetailMap.mockReturnValue(detailMap({}, true));
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await settle();
    expect(result.current.sensitiveDetailLoading).toBe(true);
    expect(mocks.getProjectProcurementItems).not.toHaveBeenCalled();
  });

  it("does not fetch a project missing from the access map", async () => {
    mocks.useDetailMap.mockReturnValue(detailMap({ "project-a": "full" }));
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.snapshot.totals.totalCount).toBe(1));
    expect(mocks.getProjectProcurementItems).toHaveBeenCalledTimes(1);
  });

  it("stays loading until every source of every project has answered", async () => {
    let release: (value: never[]) => void = () => {};
    mocks.getProjectOrders.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(mocks.getProjectOrders).toHaveBeenCalled());
    expect(result.current.sensitiveDetailLoading).toBe(true);
    mocks.getProjectOrders.mockResolvedValue([]);
    release([]);
  });

  it("stays on the browser stores in demo mode", async () => {
    mocks.useWorkspaceMode.mockReturnValue({ kind: "demo" });
    mocks.useWorkspaceProjectsState.mockReturnValue({ projects: [], isLoading: false });
    mocks.useDetailMap.mockReturnValue(detailMap({}));
    renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await settle();
    expect(mocks.getProjectProcurementItems).not.toHaveBeenCalled();
  });

  it("reports a project whose access could not be read", async () => {
    const detail = mocks.useDetailMap();
    mocks.useDetailMap.mockReturnValue({ ...detail, accessLoadFailed: true });
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.loadFailed).toBe(true));
  });

  it.each(["items", "orders", "locations"])("leaves a project out and reports it when its %s fail", async (source) => {
    const failing = {
      items: mocks.getProjectProcurementItems,
      orders: mocks.getProjectOrders,
      locations: mocks.getProjectLocations,
    }[source]!;
    failing.mockImplementation(async (projectId: string) => {
      if (projectId === "project-b") throw new Error("down");
      return projectId === "project-a" && source === "items" ? [item("project-a", "project-a-1")] : [];
    });
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    expect(result.current.sensitiveDetailLoading).toBe(false);
    expect(result.current.snapshot.projects.map((project) => project.projectId)).toEqual(["project-a"]);
  });

  it("reports a failed project list", async () => {
    mocks.useWorkspaceProjectsState.mockReturnValue({ projects: [], isLoading: false, isError: true });
    const { result } = renderHook(() => useHomeProcurementReadSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    expect(result.current.snapshot.totals.totalCount).toBe(0);
  });
});

describe("buildProcurementReadProjectSummary, a warehouse move", () => {
  it("does not count a move inside the project as a receipt", () => {
    const locations = [{ id: "location-1", isDefault: true }, { id: "location-2" }] as InventoryLocation[];
    const received = {
      ...receivedOrder("project-a", "item-1"),
      receiveEvents: [{ procurementItemId: "item-1", locationId: "location-1", deltaQty: 10 }],
    };
    const moved = {
      ...receivedOrder("project-a", "item-1"),
      id: "order-move",
      kind: "stock",
      receiveEvents: [
        { procurementItemId: "item-1", locationId: "location-1", deltaQty: -4 },
        { procurementItemId: "item-1", locationId: "location-2", deltaQty: 4 },
      ],
    };
    const summary = buildProcurementReadProjectSummary(
      { id: "project-a", title: "A" },
      [item("project-a", "item-1")],
      [received, moved] as unknown as OrderWithLines[],
      locations,
    );
    expect(summary?.rows[0].inStockQty).toBe(10);
  });
});
