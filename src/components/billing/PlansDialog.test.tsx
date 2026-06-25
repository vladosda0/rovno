import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Fix C (audit P1-3): scheduling a downgrade must NOT silently re-enable auto-renew
// on a CANCELLED subscription — that would charge a card the user opted out of.

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, BILLING_ENABLED: true };
});
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

type ActiveSub = ReturnType<typeof import("@/hooks/useActiveSubscription").useActiveSubscription>;
let activeSubReturn: ActiveSub;
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => activeSubReturn,
}));

import { PlansDialog } from "@/components/billing/PlansDialog";
import type { SubscriptionRow } from "@/lib/billing";

function brigadeSub(autoRenew: boolean): SubscriptionRow {
  return {
    id: "s1",
    profile_id: "pid-1",
    provider: "tbank",
    plan_code: "brigade",
    status: "active",
    is_current: true,
    currency: "RUB",
    amount_cents: 299000,
    auto_renew: autoRenew,
    current_period_starts_at: "2026-05-15T00:00:00Z",
    current_period_ends_at: "2026-06-15T00:00:00Z",
    canceled_at: autoRenew ? null : "2026-05-20T00:00:00Z",
    grace_until: null,
    created_at: "2026-05-15T00:00:00Z",
    pending_plan_code: null,
  };
}

function renderDialog() {
  return render(
    <MemoryRouter>
      <PlansDialog open onOpenChange={() => {}} currentPlan="brigade" />
    </MemoryRouter>,
  );
}

describe("PlansDialog downgrade guard", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a downgrade and calls NO rpc when the subscription is cancelled", async () => {
    activeSubReturn = {
      status: "active",
      subscription: brigadeSub(false), // cancelled: auto_renew = false
      readOnly: false,
      isLoading: false,
      refetch: vi.fn(),
    };

    renderDialog();
    // The Master card's downgrade button (Brigade -> Master is a downgrade).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    });

    // Never re-arm the card, never schedule on a cancelled sub.
    expect(rpc).not.toHaveBeenCalled();
    // The confirm dialog must not have opened either.
    expect(screen.queryByRole("button", { name: /schedule switch/i })).toBeNull();
  });

  it("schedules a downgrade WITHOUT enabling auto-renew when the sub is active", async () => {
    activeSubReturn = {
      status: "active",
      subscription: brigadeSub(true), // active, already auto-renewing
      readOnly: false,
      isLoading: false,
      refetch: vi.fn(),
    };

    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    });
    // Confirm the scheduled switch.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /schedule switch/i }));
    });

    // Schedules the change...
    expect(rpc).toHaveBeenCalledWith(
      "tbank_schedule_plan_change",
      expect.objectContaining({ p_target_plan_code: "master" }),
    );
    // ...but never toggles auto-renew as a side effect (the removed P1-3 hole).
    expect(rpc).not.toHaveBeenCalledWith("tbank_set_auto_renew", expect.anything());
  });
});
