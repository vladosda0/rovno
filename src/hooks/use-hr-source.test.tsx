import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as estimateV2Store from "@/data/estimate-v2-store";
import * as hrStore from "@/data/hr-store";
import * as hrSource from "@/data/hr-source";
import {
  hrQueryKeys,
  useProjectHRItems,
  useProjectHRMutations,
  useProjectHRPayments,
} from "@/hooks/use-hr-source";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
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
    taskId: null,
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

function HRProbe({ projectId, enabled = true }: { projectId: string; enabled?: boolean }) {
  const items = useProjectHRItems(projectId, { enabled });
  const payments = useProjectHRPayments(projectId, { enabled });

  return (
    <div>
      <span data-testid="item-count">{items.length}</span>
      <span data-testid="payment-count">{payments.length}</span>
      <span data-testid="item-titles">{items.map((item) => item.title).join("|")}</span>
      <span data-testid="payment-ids">{payments.map((payment) => payment.id).join("|")}</span>
    </div>
  );
}

function HRMutationProbe({ projectId }: { projectId: string }) {
  const { setAssignees, setItemStatus, createPayment } = useProjectHRMutations(projectId);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void setAssignees("hr-item-1", ["profile-2", "profile-3"]);
        }}
      >
        Update assignees
      </button>
      <button
        type="button"
        onClick={() => {
          void setItemStatus("hr-item-1", "done");
        }}
      >
        Update status
      </button>
      <button
        type="button"
        onClick={() => {
          void createPayment({
            hrItemId: "hr-item-1",
            amount: 2500,
            paidAt: "2026-03-04T00:00:00.000Z",
            note: "Transfer",
          });
        }}
      >
        Add payment
      </button>
    </div>
  );
}

describe("useProjectHRItems/useProjectHRPayments", () => {
  beforeEach(() => {
    vi.spyOn(estimateV2Store, "hydrateEstimateV2ProjectFromWorkspace").mockResolvedValue(undefined);
  });

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

    authenticateRuntimeAuth();
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

  it("does not mount supabase HR reads when disabled", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    const source = {
      mode: "supabase" as const,
      getProjectHRItems: vi.fn(),
      getProjectHRPayments: vi.fn(),
    };

    authenticateRuntimeAuth();
    vi.spyOn(hrSource, "getHRSource").mockResolvedValue(source);

    render(
      <QueryClientProvider client={queryClient}>
        <HRProbe projectId="project-1" enabled={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("item-count")).toHaveTextContent("0");
    });
    expect(screen.getByTestId("payment-count")).toHaveTextContent("0");
    expect(source.getProjectHRItems).not.toHaveBeenCalled();
    expect(source.getProjectHRPayments).not.toHaveBeenCalled();
  });

  it("invalidates the relevant HR queries after Supabase mutations", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const queryClient = createQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setAssigneesSpy = vi.spyOn(hrSource, "setProjectHRAssignees").mockResolvedValue(undefined);
    const setStatusSpy = vi.spyOn(hrSource, "setProjectHRItemStatus").mockResolvedValue(undefined);
    const createPaymentSpy = vi.spyOn(hrSource, "createProjectHRPayment").mockResolvedValue(hrPayment());

    authenticateRuntimeAuth("profile-77");

    render(
      <QueryClientProvider client={queryClient}>
        <HRMutationProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Update assignees" }).click();
      screen.getByRole("button", { name: "Update status" }).click();
      screen.getByRole("button", { name: "Add payment" }).click();
    });

    await waitFor(() => {
      expect(setAssigneesSpy).toHaveBeenCalledWith(
        { kind: "supabase", profileId: "profile-77" },
        { projectId: "project-1", hrItemId: "hr-item-1", assigneeIds: ["profile-2", "profile-3"] },
      );
    });
    expect(setStatusSpy).toHaveBeenCalledWith(
      { kind: "supabase", profileId: "profile-77" },
      { projectId: "project-1", hrItemId: "hr-item-1", status: "done" },
    );
    expect(createPaymentSpy).toHaveBeenCalledWith(
      { kind: "supabase", profileId: "profile-77" },
      {
        projectId: "project-1",
        hrItemId: "hr-item-1",
        amount: 2500,
        paidAt: "2026-03-04T00:00:00.000Z",
        note: "Transfer",
      },
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: hrQueryKeys.projectItems("profile-77", "project-1"),
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: hrQueryKeys.projectPayments("profile-77", "project-1"),
    });
  });

  it("skips React Query invalidation for browser-mode HR mutations", async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setAssigneesSpy = vi.spyOn(hrSource, "setProjectHRAssignees").mockResolvedValue(undefined);
    const setStatusSpy = vi.spyOn(hrSource, "setProjectHRItemStatus").mockResolvedValue(undefined);
    const createPaymentSpy = vi.spyOn(hrSource, "createProjectHRPayment").mockResolvedValue(hrPayment());

    render(
      <QueryClientProvider client={queryClient}>
        <HRMutationProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Update assignees" }).click();
      screen.getByRole("button", { name: "Update status" }).click();
      screen.getByRole("button", { name: "Add payment" }).click();
    });

    await waitFor(() => {
      expect(setAssigneesSpy).toHaveBeenCalledWith(
        { kind: "local" },
        { projectId: "project-1", hrItemId: "hr-item-1", assigneeIds: ["profile-2", "profile-3"] },
      );
    });
    expect(setStatusSpy).toHaveBeenCalledWith(
      { kind: "local" },
      { projectId: "project-1", hrItemId: "hr-item-1", status: "done" },
    );
    expect(createPaymentSpy).toHaveBeenCalledWith(
      { kind: "local" },
      {
        projectId: "project-1",
        hrItemId: "hr-item-1",
        amount: 2500,
        paidAt: "2026-03-04T00:00:00.000Z",
        note: "Transfer",
      },
    );
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });
});
