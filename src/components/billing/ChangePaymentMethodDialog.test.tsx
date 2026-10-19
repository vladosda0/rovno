import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const syncCardBinding = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/card-binding-sync", () => ({
  syncCardBinding: () => syncCardBinding(),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const mutateAsync = vi.fn();
vi.mock("@/hooks/useAddCard", () => ({
  useAddCard: () => ({ mutateAsync, isPending: false }),
}));

// The real form loads T-Bank's script; the dialog only needs its two callbacks.
vi.mock("@/components/billing/TBankAddCardForm", () => ({
  TBankAddCardForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button type="button" onClick={onSuccess}>
      bank form success
    </button>
  ),
}));

import { ChangePaymentMethodDialog } from "@/components/billing/ChangePaymentMethodDialog";

async function openDialog(onChanged: () => void) {
  render(
    <ChangePaymentMethodDialog
      onChanged={onChanged}
      trigger={<button type="button">change</button>}
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "change" }));
  });
}

async function reportSuccess() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "bank form success" }));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function closeWithEscape() {
  await act(async () => {
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  });
}

// A sync call the test settles by hand.
function deferredSync() {
  let settle: (changed: boolean) => void = () => {};
  syncCardBinding.mockReturnValueOnce(new Promise<boolean>((resolve) => {
    settle = resolve;
  }));
  return async (changed: boolean) => {
    await act(async () => {
      settle(changed);
    });
  };
}

describe("ChangePaymentMethodDialog asks the bank for the result", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncCardBinding.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({
      request_key: "rk",
      customer_key: "ck",
      payment_url: "https://bank.example/addcard",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("after the form reports success: rereads the card at once, and again when the bank has answered", async () => {
    const settle = deferredSync();
    const onChanged = vi.fn();

    await openDialog(onChanged);
    await reportSuccess();
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);

    await settle(false);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("rereads at 2.5 s, and at 6 s asks the bank once more and rereads after its answer", async () => {
    syncCardBinding.mockResolvedValue(false);
    const onChanged = vi.fn();

    await openDialog(onChanged);
    await reportSuccess();
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(2);

    await advance(2499);
    expect(onChanged).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(3);

    await advance(3499);
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(syncCardBinding).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(5);
  });

  it("a sync that never answers does not hold the three plain rereads back", async () => {
    syncCardBinding.mockReturnValue(new Promise<boolean>(() => {}));
    const onChanged = vi.fn();

    await openDialog(onChanged);
    await reportSuccess();
    expect(onChanged).toHaveBeenCalledTimes(1);

    await advance(2499);
    expect(onChanged).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(onChanged).toHaveBeenCalledTimes(2);

    await advance(3499);
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(onChanged).toHaveBeenCalledTimes(3);
    expect(syncCardBinding).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])(
    "when the dialog is closed after a session started: asks the bank, then rereads the card (card changed: %s)",
    async (changed) => {
      const settle = deferredSync();
      const onChanged = vi.fn();

      await openDialog(onChanged);
      await closeWithEscape();
      expect(syncCardBinding).toHaveBeenCalledTimes(1);
      expect(onChanged).not.toHaveBeenCalled();

      await settle(changed);
      expect(onChanged).toHaveBeenCalledTimes(1);
    },
  );

  it("when the session never started there is nothing to sync or reread on close", async () => {
    mutateAsync.mockReturnValue(new Promise(() => {}));
    const onChanged = vi.fn();

    await openDialog(onChanged);
    await closeWithEscape();

    expect(syncCardBinding).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
