import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SubscriptionRow } from "@/lib/billing";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

let subscription: SubscriptionRow;
let hookStatus: "active" | "grace" | "expired" = "active";
let hookReadOnly = false;
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => ({
    subscription,
    status: hookStatus,
    readOnly: hookReadOnly,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCardOnFile", () => ({
  useCardOnFile: () => ({ data: null, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useCardBindingSync", () => ({ useCardBindingSync: () => {} }));
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

function cancelledSub(provider: string): SubscriptionRow {
  return {
    id: "s1",
    profile_id: "pid-1",
    provider,
    plan_code: provider === "free" ? "free" : "master",
    status: "active",
    is_current: true,
    currency: "RUB",
    amount_cents: provider === "tbank" ? 299000 : 0,
    auto_renew: false,
    current_period_starts_at: "2026-05-15T00:00:00Z",
    current_period_ends_at: "2099-06-15T00:00:00Z",
    canceled_at: null,
    grace_until: null,
    created_at: "2026-05-15T00:00:00Z",
    pending_plan_code: null,
  };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <SubscriptionSection />
    </MemoryRouter>,
  );
}

describe("SubscriptionSection resume link", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    hookStatus = "active";
    hookReadOnly = false;
  });

  it.each(["promo", "free"])("offers no resume for a %s subscription", (provider) => {
    subscription = cancelledSub(provider);
    renderSection();

    expect(screen.queryByRole("button", { name: "Resume subscription" })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("tells a free subscription nothing about auto-renewal or an end date", () => {
    subscription = cancelledSub("free");
    renderSection();

    expect(screen.queryByText(/Auto-renewal is off/)).toBeNull();
  });

  it.each(["promo", "tbank"])("keeps the auto-renewal note for a %s subscription", (provider) => {
    subscription = cancelledSub(provider);
    renderSection();

    expect(screen.getByText(/Auto-renewal is off\. Access stays until/)).toBeTruthy();
  });

  it("keeps the resume link for a cancelled T-Bank subscription", async () => {
    subscription = cancelledSub("tbank");
    renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resume subscription" }));
    });
    expect(rpc).toHaveBeenCalledWith("tbank_set_auto_renew", {
      p_subscription_id: "s1",
      p_auto_renew: true,
    });
  });
});

describe("SubscriptionSection expiry notes", () => {
  beforeEach(() => {
    hookStatus = "active";
    hookReadOnly = false;
  });

  it("shows a free subscription past its period end neither the grace nor the read-only note", () => {
    subscription = cancelledSub("free");
    hookStatus = "grace";
    const graceView = renderSection();
    expect(screen.queryByText(/Renew to keep full access/)).toBeNull();
    graceView.unmount();

    hookStatus = "expired";
    hookReadOnly = true;
    renderSection();
    expect(screen.queryByText(/Access is limited to read-only/)).toBeNull();
  });

  it("keeps the grace and read-only notes for a T-Bank subscription", () => {
    subscription = cancelledSub("tbank");
    hookStatus = "grace";
    const graceView = renderSection();
    expect(screen.getByText(/Renew to keep full access/)).toBeTruthy();
    graceView.unmount();

    hookStatus = "expired";
    hookReadOnly = true;
    renderSection();
    expect(screen.getByText(/Access is limited to read-only/)).toBeTruthy();
  });
});
