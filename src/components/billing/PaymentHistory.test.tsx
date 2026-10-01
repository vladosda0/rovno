import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentHistory } from "@/components/billing/PaymentHistory";
import { __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";
import type { User } from "@supabase/supabase-js";

// Capture the query the component builds so we can assert the status filter and
// ordering directly (the two pre-merge-audit fixes: partial_refund is excluded,
// and ordering is by created_at, never the nullable confirmed_at).
const inSpy = vi.fn();
const orderSpy = vi.fn();
let currentRows: unknown[] = [];
let currentError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const builder = {
      select: () => builder,
      in: (column: string, values: string[]) => {
        inSpy(column, values);
        return builder;
      },
      order: (column: string, opts: { ascending: boolean }) => {
        orderSpy(column, opts);
        return builder;
      },
      limit: () =>
        Promise.resolve(
          currentError ? { data: null, error: currentError } : { data: currentRows, error: null },
        ),
    };
    return builder;
  };
  return {
    supabase: {
      from: () => makeBuilder(),
      functions: { invoke: vi.fn() },
    },
  };
});

function row(overrides: Record<string, unknown>) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    profile_id: "p1",
    plan_code: "master",
    amount_kopecks: 99000,
    currency: "RUB",
    status: "confirmed",
    error_code: null,
    error_message: null,
    confirmed_at: "2026-05-15T00:00:00Z",
    created_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymentHistory />
    </QueryClientProvider>,
  );
  return client;
}

describe("PaymentHistory", () => {
  beforeEach(() => {
    inSpy.mockReset();
    orderSpy.mockReset();
    currentRows = [];
    currentError = null;
    // Authenticated profile so the query runs (enabled: !!profileId).
    __unsafeSetRuntimeAuthStateForTests({
      status: "authenticated",
      session: null,
      user: { email: "vlad@example.com" } as User,
      profileId: "p1",
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("queries only confirmed + refunded (partial_refund excluded) ordered by created_at", async () => {
    currentRows = [row({ id: "11111111-0000-0000-0000-000000000000", status: "confirmed" })];
    renderHistory();

    await waitFor(() => expect(inSpy).toHaveBeenCalled());
    expect(inSpy).toHaveBeenCalledWith("status", ["confirmed", "refunded"]);
    // Ordering must use created_at (always set), not the nullable confirmed_at,
    // so an out-of-order refunded row cannot sort NULLS-FIRST to the top.
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("renders a refunded badge for a refunded row and none for a confirmed row", async () => {
    currentRows = [
      row({ id: "22222222-0000-0000-0000-000000000000", status: "refunded", amount_kopecks: 1000 }),
      row({ id: "33333333-0000-0000-0000-000000000000", status: "confirmed", amount_kopecks: 99000 }),
    ];
    renderHistory();

    // The refunded row shows the status badge; exactly one (the confirmed row
    // shows the success check instead, not the badge text).
    const badges = await screen.findAllByText("Refunded");
    expect(badges).toHaveLength(1);
  });

  it("shows the empty state when there are no completed payments", async () => {
    currentRows = [];
    renderHistory();

    expect(await screen.findByText("No payments yet.")).toBeInTheDocument();
    expect(screen.queryByText("Refunded")).not.toBeInTheDocument();
  });

  it("shows a load error with a retry, not the empty state, when the fetch fails", async () => {
    currentError = { message: "boom" };
    renderHistory();

    expect(await screen.findByText("Could not load payment history.")).toBeInTheDocument();
    expect(screen.queryByText("No payments yet.")).not.toBeInTheDocument();

    currentError = null;
    currentRows = [row({ id: "44444444-0000-0000-0000-000000000000", status: "refunded" })];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Refunded")).toBeInTheDocument();
    expect(screen.queryByText("Could not load payment history.")).not.toBeInTheDocument();
  });

  it("keeps the loaded list when a later refetch fails", async () => {
    currentRows = [row({ id: "55555555-0000-0000-0000-000000000000", status: "refunded" })];
    const client = renderHistory();
    expect(await screen.findByText("Refunded")).toBeInTheDocument();

    currentError = { message: "boom" };
    await act(() => client.refetchQueries({ queryKey: ["payment-history"] }));
    await waitFor(() => expect(client.getQueryState(["payment-history", "p1"])?.status).toBe("error"));
    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(screen.queryByText("Could not load payment history.")).not.toBeInTheDocument();
  });

  it("does not show the load error while the query is disabled (no profile yet)", async () => {
    __unsafeSetRuntimeAuthStateForTests({
      status: "authenticated",
      session: null,
      user: { email: "vlad@example.com" } as User,
      profileId: null,
    });
    renderHistory();

    expect(await screen.findByText("No payments yet.")).toBeInTheDocument();
    expect(screen.queryByText("Could not load payment history.")).not.toBeInTheDocument();
  });
});
