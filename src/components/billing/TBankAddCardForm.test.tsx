import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

// The card-binding form is the `addcard.iframe` feature of T-Bank's integration.js.
// The script rejects any other key ("Объект features пустой или содержит недопустимые
// значения"), and then the form never mounts (rovno#126,
// addcard-inline-widget-never-mounts-features-key-rejected).

let terminalKey = "";
const loadIntegration = vi.fn();
vi.mock("@/lib/tbank-widget", () => ({
  tbankTerminalKey: () => terminalKey,
  loadTbankIntegration: () => loadIntegration(),
}));

import { TBankAddCardForm } from "@/components/billing/TBankAddCardForm";

const PAYMENT_URL = "https://bank.example/addcard-session";

interface AddCardIframeFeature {
  container?: unknown;
  paymentStartCallback?: () => Promise<string>;
  config?: {
    loadedCallback?: () => void;
    status?: { changedCallback?: (status: string) => void };
    router?: unknown;
  };
}

function addCardFeature(init: ReturnType<typeof vi.fn>): AddCardIframeFeature {
  const config = init.mock.calls[0]?.[0] as {
    features?: { addcard?: { iframe?: AddCardIframeFeature } };
  };
  const feature = config.features?.addcard?.iframe;
  if (!feature) throw new Error("init was not given features.addcard.iframe");
  return feature;
}

describe("TBankAddCardForm", () => {
  beforeEach(() => {
    loadIntegration.mockReset();
    terminalKey = "TERMINAL_123";
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hands integration.js the card form as features.addcard.iframe", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    loadIntegration.mockResolvedValue({ init });
    const onFailed = vi.fn();

    const { getByTestId } = render(
      <TBankAddCardForm paymentUrl={PAYMENT_URL} onFailed={onFailed} />,
    );
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const config = init.mock.calls[0]?.[0] as {
      terminalKey?: string;
      product?: string;
      features?: Record<string, unknown>;
    };
    expect(config.terminalKey).toBe("TERMINAL_123");
    expect(config.product).toBe("eacq");
    // Exactly one feature, under the key the script accepts.
    expect(Object.keys(config.features ?? {})).toEqual(["addcard"]);

    const feature = addCardFeature(init);
    expect(feature.container).toBe(getByTestId("tbank-addcard"));
    await expect(feature.paymentStartCallback?.()).resolves.toBe(PAYMENT_URL);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("reports success from the status callback the script reads", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    loadIntegration.mockResolvedValue({ init });
    const onSuccess = vi.fn();

    render(<TBankAddCardForm paymentUrl={PAYMENT_URL} onSuccess={onSuccess} />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const feature = addCardFeature(init);
    expect(typeof feature.config?.loadedCallback).toBe("function");
    feature.config?.status?.changedCallback?.("PROCESSING");
    expect(onSuccess).not.toHaveBeenCalled();
    feature.config?.status?.changedCallback?.("SUCCESS");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("leaves the return to the shop to the bank's script", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    loadIntegration.mockResolvedValue({ init });

    render(<TBankAddCardForm paymentUrl={PAYMENT_URL} />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    // No router override: when the form finishes, integration.js itself sends the
    // window to the terminal's SuccessAddCardURL / FailAddCardURL.
    expect(addCardFeature(init).config?.router).toBeUndefined();
  });

  it("unmounts the box and signals onFailed when init rejects", async () => {
    const init = vi.fn().mockRejectedValue(new Error("features rejected"));
    loadIntegration.mockResolvedValue({ init });
    const onFailed = vi.fn();

    const { queryByTestId } = render(
      <TBankAddCardForm paymentUrl={PAYMENT_URL} onFailed={onFailed} />,
    );

    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(queryByTestId("tbank-addcard")).toBeNull();
  });

  it("signals onFailed at once when the terminal key is missing", () => {
    terminalKey = "";
    const onFailed = vi.fn();

    render(<TBankAddCardForm paymentUrl={PAYMENT_URL} onFailed={onFailed} />);

    expect(loadIntegration).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});
