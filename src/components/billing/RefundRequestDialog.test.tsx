import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RefundRequestDialog } from "@/components/billing/RefundRequestDialog";
import type { PaymentIntentRow } from "@/lib/billing";

const payment: PaymentIntentRow = {
  id: "abcdef12-3456-7890-abcd-ef1234567890",
  profile_id: "p1",
  plan_code: "master",
  amount_kopecks: 99000,
  currency: "RUB",
  status: "confirmed",
  error_code: null,
  error_message: null,
  confirmed_at: "2026-05-15T00:00:00Z",
  created_at: "2026-05-15T00:00:00Z",
};

describe("RefundRequestDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a reason of >=10 chars and posts the request to FormSubmit", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    render(<RefundRequestDialog payment={payment} userEmail="user@example.ru" />);
    fireEvent.click(screen.getByRole("button", { name: /request refund/i }));

    const reason = await screen.findByLabelText(/refund reason/i);
    const submit = screen.getByRole("button", { name: /send request/i });
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: "too short" } }); // 9 chars
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: "please refund this payment" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://formsubmit.co/ajax/vlad@rovno.ai");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.payment_id).toBe(payment.id);
    expect(body.user_email).toBe("user@example.ru");
    expect(body.plan_code).toBe("master");
    expect(body.reason).toBe("please refund this payment");
  });
});
