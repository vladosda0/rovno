import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Fix H (audit P2-8): a missing VITE_TBANK_TERMINAL_KEY makes the widget unmountable.
// TBankPaymentForm must signal onFailed IMMEDIATELY so the caller reveals the
// hosted-page fallback, instead of leaving a 5s dead window.

let terminalKey = "";
const loadIntegration = vi.fn();
vi.mock("@/lib/tbank-widget", () => ({
  tbankTerminalKey: () => terminalKey,
  loadTbankIntegration: () => loadIntegration(),
}));

import { TBankPaymentForm } from "@/components/billing/TBankPaymentForm";

describe("TBankPaymentForm onFailed", () => {
  beforeEach(() => {
    loadIntegration.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls onFailed synchronously on mount when the terminal key is missing", () => {
    terminalKey = "";
    const onFailed = vi.fn();

    render(<TBankPaymentForm paymentUrl="https://securepay.tbank.ru/abc" onFailed={onFailed} />);

    // No script load was even attempted, and the caller is told to fall back at once.
    expect(loadIntegration).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("initialises only the iframe widget when the terminal key is present", async () => {
    terminalKey = "TERMINAL_123";
    const init = vi.fn().mockResolvedValue(undefined);
    loadIntegration.mockResolvedValue({ init });
    const onFailed = vi.fn();

    const { queryByTestId } = render(
      <TBankPaymentForm paymentUrl="https://securepay.tbank.ru/abc" onFailed={onFailed} />,
    );
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    expect(loadIntegration).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
    expect(queryByTestId("tbank-quickpay")).toBeNull();
    expect(queryByTestId("tbank-iframe")).not.toBeNull();

    const config = init.mock.calls[0]?.[0] as { features?: Record<string, unknown> };
    expect(config.features).not.toHaveProperty("payment");
    expect(config.features).toHaveProperty("iframe");
  });
});
