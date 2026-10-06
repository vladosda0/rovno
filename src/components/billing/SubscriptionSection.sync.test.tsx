import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const syncCardBinding = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/card-binding-sync", () => ({
  syncCardBinding: () => syncCardBinding(),
}));

const refetchCard = vi.fn();
vi.mock("@/hooks/useCardOnFile", () => ({
  useCardOnFile: () => ({ data: null, refetch: refetchCard }),
}));
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => ({
    subscription: null,
    status: "none",
    readOnly: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => ({ status: "authenticated", profileId: "profile-1" }),
}));

// Children that would load the real Supabase client or the bank's script.
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

describe("SubscriptionSection asks the bank about pending card bindings when it opens", () => {
  beforeEach(() => {
    syncCardBinding.mockReset();
    refetchCard.mockReset();
  });

  it("asks the bank once on mount and rereads the card when it changed", async () => {
    syncCardBinding.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <SubscriptionSection />
      </MemoryRouter>,
    );

    await waitFor(() => expect(refetchCard).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(refetchCard).toHaveBeenCalledTimes(1);
  });

  it("leaves the card alone when nothing changed", async () => {
    syncCardBinding.mockResolvedValue(false);

    render(
      <MemoryRouter>
        <SubscriptionSection />
      </MemoryRouter>,
    );

    await waitFor(() => expect(syncCardBinding).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(refetchCard).not.toHaveBeenCalled();
  });

  it("does not reread the card before the bank has answered", async () => {
    syncCardBinding.mockReturnValue(new Promise<boolean>(() => {}));

    render(
      <MemoryRouter>
        <SubscriptionSection />
      </MemoryRouter>,
    );

    await waitFor(() => expect(syncCardBinding).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(refetchCard).not.toHaveBeenCalled();
  });
});
