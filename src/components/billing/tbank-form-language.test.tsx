import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import i18n from "@/i18n";

const loadIntegration = vi.fn();
vi.mock("@/lib/tbank-widget", () => ({
  tbankTerminalKey: () => "TERMINAL_123",
  loadTbankIntegration: () => loadIntegration(),
}));

import { TBankAddCardForm } from "@/components/billing/TBankAddCardForm";
import { TBankPaymentForm } from "@/components/billing/TBankPaymentForm";

const PAYMENT_URL = "https://bank.example/session";

const forms = [
  {
    name: "TBankPaymentForm",
    render: (onFailed: () => void) => render(<TBankPaymentForm paymentUrl={PAYMENT_URL} onFailed={onFailed} />),
    testId: "tbank-iframe",
    featureConfig: (config: InitArg) => config.features.iframe?.config,
  },
  {
    name: "TBankAddCardForm",
    render: (onFailed: () => void) => render(<TBankAddCardForm paymentUrl={PAYMENT_URL} onFailed={onFailed} />),
    testId: "tbank-addcard",
    featureConfig: (config: InitArg) => config.features.addcard?.iframe.config,
  },
];

interface InitArg {
  features: {
    iframe?: { config?: Record<string, unknown> };
    addcard?: { iframe: { config?: Record<string, unknown> } };
  };
}

describe.each(forms)("$name bank form language", (form) => {
  let setLang: ReturnType<typeof vi.fn>;
  let init: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLang = vi.fn().mockResolvedValue(undefined);
    init = vi.fn().mockResolvedValue({ setLang });
    loadIntegration.mockReset();
    loadIntegration.mockResolvedValue({ init });
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
  });

  it("switches the bank form to English after init when the interface is English", async () => {
    const onFailed = vi.fn();
    form.render(onFailed);

    await waitFor(() => expect(setLang).toHaveBeenCalledWith("en"));
    expect(setLang).toHaveBeenCalledTimes(1);
    expect(init.mock.invocationCallOrder[0]).toBeLessThan(setLang.mock.invocationCallOrder[0]);
    expect(form.featureConfig(init.mock.calls[0][0] as InitArg)).not.toHaveProperty("language");
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("leaves the bank's own Russian default when the interface is Russian", async () => {
    await i18n.changeLanguage("ru");
    form.render(vi.fn());

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(setLang).not.toHaveBeenCalled();
  });

  it("keeps the form when the bank refuses the language switch", async () => {
    setLang.mockRejectedValue(new Error("lang"));
    const onFailed = vi.fn();
    const { getByTestId } = form.render(onFailed);

    await waitFor(() => expect(setLang).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFailed).not.toHaveBeenCalled();
    expect(getByTestId(form.testId)).toBeTruthy();
  });

  it.each([
    ["returns no promise", () => undefined],
    [
      "throws",
      () => {
        throw new Error("lang");
      },
    ],
  ])("keeps the form when the bank's setLang %s", async (_label, impl) => {
    setLang.mockImplementation(impl);
    const onFailed = vi.fn();
    const { getByTestId } = form.render(onFailed);

    await waitFor(() => expect(setLang).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFailed).not.toHaveBeenCalled();
    expect(getByTestId(form.testId)).toBeTruthy();
  });

  it("does not touch the bank's language once the form is gone", async () => {
    let finishInit: (api: unknown) => void = () => undefined;
    init.mockReturnValue(new Promise((resolve) => (finishInit = resolve)));
    const onFailed = vi.fn();
    const { unmount } = form.render(onFailed);

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    unmount();
    finishInit({ setLang });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setLang).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });
});
