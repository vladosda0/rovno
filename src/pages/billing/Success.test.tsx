import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, BILLING_ENABLED: true };
});

type StatusRow = { id: string; status: string; error_code: string | null; plan_code: string };
let statusData: StatusRow | null | undefined;
vi.mock("@/hooks/usePaymentStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePaymentStatus")>();
  return { ...actual, usePaymentStatus: () => ({ data: statusData }) };
});

vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => ({ subscription: null, refetch: vi.fn() }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import Success from "@/pages/billing/Success";

const SUCCESS_TITLE = "Subscription activated";
const PENDING_TITLE = "Waiting for the payment to be confirmed";

const tree = (url: string) => <MemoryRouter initialEntries={[url]}><Success /></MemoryRouter>;
const row = (status: string, error_code: string | null = null): StatusRow =>
  ({ id: "i1", status, error_code, plan_code: "master" });

describe("Success", () => {
  beforeEach(() => {
    statusData = undefined;
    mockNavigate.mockReset();
  });

  it("congratulates only on a confirmed payment", () => {
    statusData = row("confirmed");
    render(tree("/billing/success?intent=i1"));

    expect(screen.getByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
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
    ["partial_refund", row("partial_refund"), "/billing/fail?intent=i1&reason=partial_refund"],
  ])("sends a %s payment to the fail screen", (_label, data, target) => {
    statusData = data;
    render(tree("/billing/success?intent=i1"));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(target, { replace: true });
    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
  });

  it("sends a visit with no intent to the billing settings", () => {
    render(tree("/billing/success"));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=billing", { replace: true });
    expect(screen.queryByText(SUCCESS_TITLE)).toBeNull();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
  });
});
