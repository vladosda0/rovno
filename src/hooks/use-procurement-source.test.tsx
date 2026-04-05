import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as estimateV2Store from "@/data/estimate-v2-store";
import * as procurementStore from "@/data/procurement-store";
import * as procurementSource from "@/data/procurement-source";
import { useProjectProcurementItems } from "@/hooks/use-procurement-source";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { ProcurementItemV2 } from "@/types/entities";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function procurementItem(partial: Partial<ProcurementItemV2> = {}): ProcurementItemV2 {
  return {
    id: "procurement-item-1",
    projectId: "project-1",
    stageId: null,
    categoryId: null,
    type: "material",
    name: "Copper cable",
    spec: "NYM 3x2.5",
    unit: "m",
    requiredByDate: null,
    requiredQty: 12,
    orderedQty: 0,
    receivedQty: 0,
    plannedUnitPrice: 10,
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
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  };
}

function ProcurementProbe({ projectId }: { projectId: string }) {
  const items = useProjectProcurementItems(projectId);

  return (
    <div>
      <span data-testid="item-count">{items.length}</span>
      <span data-testid="item-names">{items.map((item) => item.name).join("|")}</span>
    </div>
  );
}

describe("useProjectProcurementItems", () => {
  beforeEach(() => {
    vi.spyOn(estimateV2Store, "hydrateEstimateV2ProjectFromWorkspace").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns procurement-store data in browser modes and reacts to procurement subscriptions", async () => {
    const queryClient = createQueryClient();
    let currentItems = [procurementItem({ name: "Copper cable" })];
    const listeners = new Set<() => void>();

    const getItemsSpy = vi.spyOn(procurementStore, "getProcurementItems").mockImplementation(() => currentItems);
    vi.spyOn(procurementStore, "subscribeProcurement").mockImplementation((callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ProcurementProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("item-count")).toHaveTextContent("1");
    expect(screen.getByTestId("item-names")).toHaveTextContent("Copper cable");

    act(() => {
      currentItems = [procurementItem({ id: "procurement-item-2", name: "Drywall screws" })];
      listeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(screen.getByTestId("item-names")).toHaveTextContent("Drywall screws");
    });
    expect(getItemsSpy).toHaveBeenCalledWith("project-1");
  });

  it("returns empty arrays while Supabase procurement data is loading, then mapped results", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    let resolveItems: (value: ProcurementItemV2[]) => void;
    const itemsPromise = new Promise<ProcurementItemV2[]>((resolve) => {
      resolveItems = resolve;
    });
    const getItemsSpy = vi.spyOn(procurementStore, "getProcurementItems");
    const source = {
      mode: "supabase" as const,
      getProjectProcurementItems: vi.fn(() => itemsPromise),
    };

    authenticateRuntimeAuth();
    vi.spyOn(procurementSource, "getProcurementSource").mockResolvedValue(source);

    render(
      <QueryClientProvider client={queryClient}>
        <ProcurementProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("item-count")).toHaveTextContent("0");
    expect(getItemsSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveItems!([procurementItem({ name: "Supabase procurement item" })]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("item-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("item-names")).toHaveTextContent("Supabase procurement item");
    expect(source.getProjectProcurementItems).toHaveBeenCalledWith("project-1", expect.any(String));
  });
});
