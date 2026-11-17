import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, BILLING_ENABLED: true };
});

type StatusRow = {
  id: string;
  status: string;
  error_code: string | null;
  plan_code: string;
  confirmed_at: string | null;
};
let statusData: StatusRow | null | undefined;
vi.mock("@/hooks/usePaymentStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePaymentStatus")>();
  return { ...actual, usePaymentStatus: () => ({ data: statusData }) };
});

let subscriptionData: { plan_code: string; current_period_ends_at: string } | null = null;
const refetchSubscription = vi.fn();
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => ({ subscription: subscriptionData, refetch: refetchSubscription }),
}));

const trackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import Success from "@/pages/billing/Success";

const SUCCESS_TITLE = "Subscription activated";
const PENDING_TITLE = "Waiting for the payment to be confirmed";

const tree = (url: string) => <MemoryRouter initialEntries={[url]}><Success /></MemoryRouter>;
const CONFIRMED_AT = "2026-11-12T15:20:26Z";
// The server sets confirmed_at only when it records the bank's confirmation of the capture
// (callback, renewal reconcile, settlement); a 'partial_refund' row has it unless the refund
// notification was processed first.
const row = (
  status: string,
  error_code: string | null = null,
  confirmed_at: string | null = status === "confirmed" || status === "partial_refund" ? CONFIRMED_AT : null,
): StatusRow => ({ id: "i1", status, error_code, plan_code: "master", confirmed_at });

describe("Success", () => {
  beforeEach(() => {
    statusData = undefined;
    subscriptionData = null;
    mockNavigate.mockReset();
    refetchSubscription.mockReset();
    trackEvent.mockReset();
  });

  it("congratulates on a confirmed payment", () => {
    statusData = row("confirmed");
    render(tree("/billing/success?intent=i1"));

    expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("billing_payment_confirmed", { plan: "master" });
  });

  it.each([
    ["pending", row("pending")],
    ["new", row("new")],
    ["authorized", row("authorized")],
    ["a status still loading", undefined],
    ["an intent the user cannot read", null],
  ])("waits instead of congratulating on %s", (_label, data) => {
    statusData = data;
    render(tree("/billing/success?intent=i1"));

    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();
    expect(screen.queryByText(/receipt/i)).toBeNull();
    expect(screen.getByText(PENDING_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Subscription settings" })).toHaveAttribute(
      "href",
      "/settings?tab=billing",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("switches to the congratulation once the payment confirms", () => {
    statusData = row("authorized");
    const view = render(tree("/billing/success?intent=i1"));
    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();

    statusData = row("confirmed");
    view.rerender(tree("/billing/success?intent=i1"));
    expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
  });

  it.each([
    ["rejected", row("rejected", "100"), "/billing/fail?intent=i1&reason=100"],
    ["cancelled", row("cancelled"), "/billing/fail?intent=i1"],
    ["refunded", row("refunded"), "/billing/fail?intent=i1&reason=refunded"],
  ])("sends a %s payment to the fail screen", (_label, data, target) => {
    statusData = data;
    render(tree("/billing/success?intent=i1"));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(target, { replace: true });
    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
  });

  it("shows the congratulation for a partially refunded payment that was confirmed", () => {
    statusData = row("partial_refund");
    render(tree("/billing/success?intent=i1"));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith("billing_payment_confirmed", { plan: "master" });
  });

  it.each([
    ["no subscription", null],
    ["a paid subscription from an earlier payment", { plan_code: "master", current_period_ends_at: "2026-12-12T12:00:00Z" }],
  ])("waits on a partial refund the bank has not confirmed yet, with %s", (_label, sub) => {
    statusData = row("partial_refund", null, null);
    subscriptionData = sub;
    render(tree("/billing/success?intent=i1"));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(PENDING_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "partial_refund"])(
    "keeps asking for the subscription while a %s payment has not reached it",
    (status) => {
      vi.useFakeTimers();
      try {
        statusData = row(status);
        render(tree("/billing/success?intent=i1"));
        expect(refetchSubscription).not.toHaveBeenCalled();
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(refetchSubscription).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(["confirmed", "partial_refund"])(
    "shows the period end of the paid plan on a %s payment",
    (status) => {
      statusData = row(status);
      subscriptionData = { plan_code: "master", current_period_ends_at: "2026-12-12T12:00:00Z" };
      render(tree("/billing/success?intent=i1"));

      expect(screen.getByText("Active until December 12, 2026")).toBeInTheDocument();
    },
  );

  it("shows no period end while the subscription is still on another plan", () => {
    statusData = row("partial_refund");
    subscriptionData = { plan_code: "brigade", current_period_ends_at: "2026-12-12T12:00:00Z" };
    render(tree("/billing/success?intent=i1"));

    expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(/Active until/)).toBeNull();
  });

  it("sends a visit with no intent to the billing settings", () => {
    render(tree("/billing/success"));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=billing", { replace: true });
    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
  });
});
