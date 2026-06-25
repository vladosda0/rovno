import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RefundRequestForm } from "@/components/billing/RefundRequestForm";
import type { PaymentIntentRow } from "@/lib/billing";

// Fix E (audit P2-6): the refund request goes to the internal send-refund-request
// Edge Function, NOT formsubmit.co, and the client never sends the user's email.
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

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
  beforeEach(() => {
    invoke.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires a reason >=10 chars and invokes send-refund-request with no client email", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });

    render(<RefundRequestForm payment={payment} />);

    const reason = screen.getByLabelText(/refund reason/i);
    const submit = screen.getByRole("button", { name: /send request/i });
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: "too short" } }); // 9 chars
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: "please refund this payment" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [fnName, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fnName).toBe("send-refund-request");
    expect(opts.body).toEqual({
      payment_id: payment.id,
      reason: "please refund this payment",
      partial: false,
    });
    // The user's email is derived server-side from the JWT — never sent by the client.
    expect(JSON.stringify(opts.body)).not.toContain("@");
  });

  it("flags the request as partial when the partial prop is set", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });

    render(<RefundRequestForm payment={payment} partial />);
    fireEvent.change(screen.getByLabelText(/refund reason/i), {
      target: { value: "please refund part of this" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const opts = invoke.mock.calls[0][1] as { body: Record<string, unknown> };
    expect(opts.body.partial).toBe(true);
  });

  it("re-enables submit (keeps the reason) when the function returns an error", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });

    render(<RefundRequestForm payment={payment} />);
    fireEvent.change(screen.getByLabelText(/refund reason/i), {
      target: { value: "this should fail to send" },
    });
    const submit = screen.getByRole("button", { name: /send request/i });
    fireEvent.click(submit);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    // Not cleared on failure, so the user can retry.
    await waitFor(() => expect(submit).toBeEnabled());
  });
});
