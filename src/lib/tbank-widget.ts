// T-Bank web-acquiring JS widget loader.
//
// IMPORTANT: the script URL and the init API (speedpay.init / iframe.connect)
// follow the phase 1c design doc and MUST be verified against the live T-Bank
// docs (developer.tbank.ru/eacq/intro/developer/setup_js) before
// VITE_BILLING_ENABLED is turned on. Everything degrades gracefully: if the
// script fails to load or the global is absent, the widgets render a fallback
// and the flow still completes via payment-status polling.

const TBANK_SCRIPT_URL = "https://acdn.tbank.ru/static/web-acquiring/checkout.js";
const SCRIPT_ID = "tbank-web-acquiring";
const READY_TIMEOUT_MS = 10000;
const READY_POLL_MS = 250;

export interface TbankWidgetApi {
  speedpay?: { init?: (opts: Record<string, unknown>) => void };
  iframe?: { connect?: (opts: Record<string, unknown>) => void };
}

declare global {
  interface Window {
    tbankCheckout?: TbankWidgetApi;
  }
}

let loaderPromise: Promise<TbankWidgetApi> | null = null;

export function loadTbankWidget(): Promise<TbankWidgetApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("T-Bank widget needs a browser environment"));
  }
  if (window.tbankCheckout) {
    return Promise.resolve(window.tbankCheckout);
  }
  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise<TbankWidgetApi>((resolve, reject) => {
    const waitForGlobal = () => {
      const start = Date.now();
      const poll = () => {
        if (window.tbankCheckout) {
          resolve(window.tbankCheckout);
        } else if (Date.now() - start > READY_TIMEOUT_MS) {
          reject(new Error("T-Bank widget global did not appear"));
        } else {
          window.setTimeout(poll, READY_POLL_MS);
        }
      };
      poll();
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      waitForGlobal();
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = TBANK_SCRIPT_URL;
    script.async = true;
    script.onload = waitForGlobal;
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Failed to load the T-Bank widget script"));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
}
