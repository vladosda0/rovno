import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentHistory } from "@/components/billing/PaymentHistory";
import { __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";
import { formatRubFromKopecks } from "@/lib/billing";
import type { User } from "@supabase/supabase-js";

// Capture the query the component builds so we can assert the status filter and
// ordering directly (the status filter keeps partially refunded payments in the
// list, and ordering is by created_at, never the nullable confirmed_at).
const selectSpy = vi.fn();
const inSpy = vi.fn();
const orderSpy = vi.fn();
let currentRows: unknown[] = [];
let currentError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const builder = {
      select: (columns: string) => {
        selectSpy(columns);
        return builder;
      },
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
    selectSpy.mockReset();
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

  it("queries confirmed, refunded and partial_refund ordered by created_at", async () => {
    currentRows = [row({ id: "11111111-0000-0000-0000-000000000000", status: "confirmed" })];
    renderHistory();

    await waitFor(() => expect(inSpy).toHaveBeenCalled());
    expect(inSpy).toHaveBeenCalledWith("status", ["confirmed", "refunded", "partial_refund"]);
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

  it("renders a partial refund as its own badge, without the refunded amount in the dialog", async () => {
    currentRows = [
      row({
        id: "55555555-0000-0000-0000-000000000000",
        status: "partial_refund",
        amount_refunded_kopecks: 30000,
      }),
    ];
    renderHistory();

    const badge = await screen.findByText("Partially refunded");
    expect(screen.queryByText("Refunded")).not.toBeInTheDocument();
    fireEvent.click(badge);
    expect(selectSpy.mock.calls[0][0]).toContain("amount_refunded_kopecks");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(formatRubFromKopecks(30000))).not.toBeInTheDocument();
  });

  it("keeps the partial refund badge on a row that carries no refunded amount", async () => {
    // tbank-recurrent-charge reconciliation writes partial_refund without an amount.
    currentRows = [
      row({
        id: "66666666-0000-0000-0000-000000000000",
        status: "partial_refund",
        amount_refunded_kopecks: 0,
      }),
    ];
    renderHistory();

    expect(await screen.findByText("Partially refunded")).toBeInTheDocument();
  });

  it("reads a full refund with its amount recorded as refunded, not partially refunded", async () => {
    currentRows = [
      row({
        id: "99999999-0000-0000-0000-000000000000",
        status: "refunded",
        amount_refunded_kopecks: 99000,
      }),
    ];
    renderHistory();

    fireEvent.click(await screen.findByText("Refunded"));
    expect(screen.queryByText("Partially refunded")).not.toBeInTheDocument();
    const tab = await screen.findByRole("tab", { name: "Refund" });
    fireEvent.mouseDown(tab, { button: 0 });
    expect(await screen.findByText("This payment has already been refunded.")).toBeInTheDocument();
  });

  it("does not call a partially refunded payment fully refunded, nor offer a second request", async () => {
    currentRows = [
      row({
        id: "77777777-0000-0000-0000-000000000000",
        status: "partial_refund",
        amount_refunded_kopecks: 30000,
      }),
    ];
    renderHistory();

    fireEvent.click(await screen.findByText("Partially refunded"));
    const tab = await screen.findByRole("tab", { name: "Refund" });
    fireEvent.mouseDown(tab, { button: 0 });
    expect(await screen.findByText("A partial refund has already been issued for this payment.")).toBeInTheDocument();
    expect(screen.queryByText("This payment has already been refunded.")).not.toBeInTheDocument();
  });

  it("treats a confirmed row with money already returned as a partial refund", async () => {
    // A delayed CONFIRMED after PARTIAL_REFUNDED moves the row to 'confirmed' and
    // keeps amount_refunded_kopecks. It must not read as an untouched payment
    // that still offers a full refund.
    currentRows = [
      row({
        id: "88888888-0000-0000-0000-000000000000",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        amount_refunded_kopecks: 30000,
      }),
    ];
    renderHistory();

    fireEvent.click(await screen.findByText("Partially refunded"));
    const tab = await screen.findByRole("tab", { name: "Refund" });
    fireEvent.mouseDown(tab, { button: 0 });
    expect(await screen.findByText("A partial refund has already been issued for this payment.")).toBeInTheDocument();
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
