import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as hrStore from "@/data/hr-store";
import * as hrSource from "@/data/hr-source";
import { useProjectHRItems, useProjectHRPayments } from "@/hooks/use-hr-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import type { HRPayment, HRPlannedItem } from "@/types/hr";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function hrItem(partial: Partial<HRPlannedItem> = {}): HRPlannedItem {
  return {
    id: "hr-item-1",
    projectId: "project-1",
    stageId: "stage-1",
    workId: "work-1",
    title: "HR Item One",
    type: "labor",
    plannedQty: 0,
    plannedRate: 0,
    assignee: null,
    assigneeIds: [],
    status: "planned",
    lockedFromEstimate: false,
    sourceEstimateV2LineId: null,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  };
}

function hrPayment(partial: Partial<HRPayment> = {}): HRPayment {
  return {
    id: "payment-1",
    projectId: "project-1",
    hrItemId: "hr-item-1",
    amount: 1000,
    paidAt: "2026-03-01T00:00:00.000Z",
    note: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  };
}

function HRProbe({ projectId }: { projectId: string }) {
  const items = useProjectHRItems(projectId);
  const payments = useProjectHRPayments(projectId);

  return (
    <div>
      <span data-testid="item-count">{items.length}</span>
      <span data-testid="payment-count">{payments.length}</span>
      <span data-testid="item-titles">{items.map((item) => item.title).join("|")}</span>
      <span data-testid="payment-ids">{payments.map((payment) => payment.id).join("|")}</span>
    </div>
  );
}

describe("useProjectHRItems/useProjectHRPayments", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns hr-store data in browser modes and reacts to HR subscriptions", async () => {
    const queryClient = createQueryClient();
    let currentItems = [hrItem({ title: "HR Item One" })];
    let currentPayments = [hrPayment({ id: "payment-1" })];
    const listeners = new Set<() => void>();

    const getItemsSpy = vi.spyOn(hrStore, "getHRItems").mockImplementation(() => currentItems);
    const getPaymentsSpy = vi.spyOn(hrStore, "getHRPayments").mockImplementation(() => currentPayments);
    vi.spyOn(hrStore, "subscribeHR").mockImplementation((callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HRProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("item-count")).toHaveTextContent("1");
    expect(screen.getByTestId("payment-count")).toHaveTextContent("1");
    expect(screen.getByTestId("item-titles")).toHaveTextContent("HR Item One");
    expect(screen.getByTestId("payment-ids")).toHaveTextContent("payment-1");

    act(() => {
      currentItems = [hrItem({ title: "HR Item Two", id: "hr-item-2" })];
      currentPayments = [hrPayment({ id: "payment-2", hrItemId: "hr-item-2" })];
      listeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(screen.getByTestId("item-titles")).toHaveTextContent("HR Item Two");
    });
    expect(screen.getByTestId("payment-ids")).toHaveTextContent("payment-2");
    expect(getItemsSpy).toHaveBeenCalledWith("project-1");
    expect(getPaymentsSpy).toHaveBeenCalledWith("project-1");
  });

  it("returns empty arrays while Supabase HR data is loading, then mapped results", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    let resolveItems: (value: HRPlannedItem[]) => void;
    let resolvePayments: (value: HRPayment[]) => void;
    const itemsPromise = new Promise<HRPlannedItem[]>((resolve) => {
      resolveItems = resolve;
    });
    const paymentsPromise = new Promise<HRPayment[]>((resolve) => {
      resolvePayments = resolve;
    });
    const getItemsSpy = vi.spyOn(hrStore, "getHRItems");
    const getPaymentsSpy = vi.spyOn(hrStore, "getHRPayments");
    const source = {
      mode: "supabase" as const,
      getProjectHRItems: vi.fn(() => itemsPromise),
      getProjectHRPayments: vi.fn(() => paymentsPromise),
    };

    queryClient.setQueryData(workspaceQueryKeys.mode(), {
      kind: "supabase",
      profileId: "profile-1",
    });
    vi.spyOn(hrSource, "getHRSource").mockResolvedValue(source);

    render(
      <QueryClientProvider client={queryClient}>
        <HRProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("item-count")).toHaveTextContent("0");
    expect(screen.getByTestId("payment-count")).toHaveTextContent("0");
    expect(getItemsSpy).not.toHaveBeenCalled();
    expect(getPaymentsSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveItems!([hrItem({ title: "Supabase HR Item" })]);
      resolvePayments!([hrPayment({ id: "supabase-payment-1" })]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("item-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("payment-count")).toHaveTextContent("1");
    expect(screen.getByTestId("item-titles")).toHaveTextContent("Supabase HR Item");
    expect(screen.getByTestId("payment-ids")).toHaveTextContent("supabase-payment-1");
    expect(source.getProjectHRItems).toHaveBeenCalledWith("project-1");
    expect(source.getProjectHRPayments).toHaveBeenCalledWith("project-1");
  });
});
