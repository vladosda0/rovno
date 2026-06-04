import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RefundRequestForm } from "@/components/billing/RefundRequestForm";
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

describe("RefundRequestForm", () => {
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

    render(<RefundRequestForm payment={payment} userEmail="user@example.ru" />);

    const reason = screen.getByLabelText(/refund reason/i);
    const submit = screen.getByRole("button", { name: /send request/i });
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: "too short" } }); // 9 chars
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: "please refund this payment" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://formsubmit.co/ajax/69d1ca51fb2f4cef4cfd12f269d0b57e");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    // #6: subject is "Refund - <payment id>".
    expect(body._subject).toBe(`Refund - ${payment.id}`);
    expect(body.refund_type).toBe("full");
    expect(body.payment_id).toBe(payment.id);
    expect(body.user_email).toBe("user@example.ru");
    expect(body.plan_code).toBe("master");
    expect(body.reason).toBe("please refund this payment");
    // #5: the second free-text comment field is gone.
    expect(body.additional_comment).toBeUndefined();
  });

  it("flags the request as partial when the partial prop is set", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    render(<RefundRequestForm payment={payment} userEmail="user@example.ru" partial />);
    fireEvent.change(screen.getByLabelText(/refund reason/i), {
      target: { value: "please refund part of this" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.refund_type).toBe("partial");
  });
});
