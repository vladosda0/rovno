import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Force the billing flag on for these tests (it is false by default in test env).
vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, BILLING_ENABLED: true };
});

const mutateAsync = vi.fn();
vi.mock("@/hooks/useInitPayment", () => ({
  useInitPayment: () => ({ mutateAsync, isPending: false, isError: false, isSuccess: false }),
}));

type ActiveSub = ReturnType<typeof import("@/hooks/useActiveSubscription").useActiveSubscription>;
let activeSubReturn: ActiveSub;
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => activeSubReturn,
}));

vi.mock("@/hooks/usePaymentStatus", () => ({
  usePaymentStatus: () => ({ data: undefined }),
  isTerminalPaymentStatus: () => false,
}));

// Widget that never reports ready, so the C1 fallback timer fires. The mock records
// every onReady reference it receives to assert callback stability (#1).
const onReadyRefs: Array<unknown> = [];
vi.mock("@/components/billing/TBankPaymentForm", () => ({
  TBankPaymentForm: (props: { onReady?: () => void }) => {
    onReadyRefs.push(props.onReady);
    return null;
  },
}));

import Checkout from "@/pages/billing/Checkout";
import {
  __unsafeResetRuntimeAuthForTests,
  __unsafeSetRuntimeAuthStateForTests,
} from "@/hooks/use-runtime-auth";
import type { Session, User } from "@supabase/supabase-js";

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={["/billing/checkout?plan=master"]}>
      <Checkout />
    </MemoryRouter>,
  );
}

function noSubscription(): ActiveSub {
  return { status: "none", subscription: null, readOnly: false, isLoading: false, refetch: vi.fn() };
}

describe("Checkout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutateAsync.mockReset();
    onReadyRefs.length = 0;
    activeSubReturn = noSubscription();
    __unsafeSetRuntimeAuthStateForTests({
      status: "authenticated",
      session: {} as Session,
      user: { email: "user@example.ru" } as User,
      profileId: "pid-1",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    __unsafeResetRuntimeAuthForTests();
    vi.clearAllMocks();
  });

  it("C1: reveals the hosted-page fallback link after the widget timeout", async () => {
    mutateAsync.mockResolvedValue({
      intent_id: "i1",
      payment_id: "p1",
      status: "new",
      amount_kopecks: 99000,
      plan_display_name: "Дом",
      payment_url: "https://securepay.tbank.ru/abc",
    });

    renderCheckout();
    // Init is gated on the recurring-consent checkbox: nothing is sent to T-Bank
    // until the user ticks it (T-Bank go-live requirement).
    expect(mutateAsync).not.toHaveBeenCalled();
    // M3: the payment surface must be ABSENT before consent — guards against a
    // future regression that drops `&& consent` from the widget/fallback render.
    expect(onReadyRefs.length).toBe(0);
    expect(screen.queryByTestId("tbank-fallback-link")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    // Flush the init promise so payment_id is set and the 5s fallback timer is
    // scheduled...
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // ...then advance past the fallback window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200);
    });

    const link = screen.getByTestId("tbank-fallback-link");
    expect(link).toHaveAttribute("href", "https://securepay.tbank.ru/abc");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ consent_accepted: true, consent_version: expect.any(String) }),
    );
  });

  it("#1: passes a stable onReady across re-renders so the widget can't re-connect", async () => {
    mutateAsync.mockResolvedValue({
      intent_id: "i1",
      payment_id: "p1",
      status: "new",
      amount_kopecks: 99000,
      plan_display_name: "Дом",
      payment_url: "https://securepay.tbank.ru/abc",
    });

    renderCheckout();
    // Tick the recurring-consent checkbox to trigger the gated init.
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Force an extra re-render via the fallback timer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200);
    });

    // The widget was rendered across multiple Checkout re-renders...
    expect(onReadyRefs.length).toBeGreaterThanOrEqual(2);
    // ...always with the same callback identity (useCallback), so its effect
    // deps don't change and iframe.connect() can't re-fire.
    const distinct = new Set(onReadyRefs.filter(Boolean));
    expect(distinct.size).toBe(1);
  });

  it("M2: blocks checkout and skips init when an active subscription exists", () => {
    activeSubReturn = {
      status: "active",
      subscription: {
        id: "s1",
        profile_id: "pid-1",
        provider: "tbank",
        plan_code: "master",
        status: "active",
        is_current: true,
        currency: "RUB",
        amount_cents: 99000,
        auto_renew: true,
        current_period_starts_at: "2026-05-15T00:00:00Z",
        current_period_ends_at: "2026-06-15T00:00:00Z",
        canceled_at: null,
        grace_until: null,
        created_at: "2026-05-15T00:00:00Z",
      },
      readOnly: false,
      isLoading: false,
      refetch: vi.fn(),
    };

    renderCheckout();

    expect(screen.getByText("You already have a subscription")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
