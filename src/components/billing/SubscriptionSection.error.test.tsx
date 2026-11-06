import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useActiveSubscriptionMock } = vi.hoisted(() => ({
  useActiveSubscriptionMock: vi.fn(),
}));

vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: useActiveSubscriptionMock,
}));
vi.mock("@/hooks/useCardOnFile", () => ({
  useCardOnFile: () => ({ data: null, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useCardBindingSync", () => ({ useCardBindingSync: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/billing/PaymentHistory", () => ({ PaymentHistory: () => null }));
vi.mock("@/components/billing/ChangePaymentMethodDialog", () => ({
  ChangePaymentMethodDialog: () => null,
}));
vi.mock("@/components/billing/CancelSubscriptionDialog", () => ({
  CancelSubscriptionDialog: () => null,
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { SubscriptionSection } from "@/components/billing/SubscriptionSection";

function renderSection() {
  return render(
    <MemoryRouter>
      <SubscriptionSection />
    </MemoryRouter>,
  );
}

describe("SubscriptionSection when the subscription could not be read", () => {
  beforeEach(() => {
    useActiveSubscriptionMock.mockReset();
  });

  it("shows a load error with retry instead of «no subscription»", () => {
    const refetch = vi.fn();
    useActiveSubscriptionMock.mockReturnValue({
      subscription: null,
      status: "none",
      readOnly: false,
      isLoading: false,
      isError: true,
      isLoadingError: true,
      refetch,
    });
    renderSection();
    expect(screen.queryByText("You don't have an active subscription yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose a plan")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your subscription.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("still offers a plan when the read succeeded and there is no subscription", () => {
    useActiveSubscriptionMock.mockReturnValue({
      subscription: null,
      status: "none",
      readOnly: false,
      isLoading: false,
      isError: false,
      isLoadingError: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByText("You don't have an active subscription yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps showing a known subscription when only a refetch failed", () => {
    useActiveSubscriptionMock.mockReturnValue({
      subscription: { id: "sub-1", plan_code: "master", amount_cents: 99000, auto_renew: true },
      status: "active",
      readOnly: false,
      isLoading: false,
      isError: true,
      isLoadingError: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Payments, card and billing period.")).toBeInTheDocument();
  });

  it("still offers a plan when a refetch fails after a read that found no subscription", () => {
    useActiveSubscriptionMock.mockReturnValue({
      subscription: null,
      status: "none",
      readOnly: false,
      isLoading: false,
      isError: true,
      isLoadingError: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByText("You don't have an active subscription yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
