// T-Bank web-acquiring integration.js loader.
//
// Loads T-Bank's official integration script (verified against
// developer.tbank.ru/eacq/intro/developer/setup_js) and resolves the global
// `PaymentIntegration`. Callers then call PaymentIntegration.init(...) ONCE per page
// with the features they need:
//   - iframe        — inline card payment form
//   - payment       — quick-pay buttons (T-Pay / SBP / SberPay / …)
//   - addcardIframe — card-binding form ("change card")
// Every feature takes { container, config, paymentStartCallback }, where
// paymentStartCallback resolves to a T-Bank PaymentURL produced by our backend
// (tbank-init-payment for checkout, tbank-add-card for rebind).
//
// Everything degrades gracefully: if the script fails to load, the global never
// appears, init rejects, or VITE_TBANK_TERMINAL_KEY is unset, the caller renders a
// fallback (redirect to the hosted PaymentURL) and the flow still completes via
// payment-status polling / the notification webhook.
//
// CSP (if any is set at the edge): allow https://*.tinkoff.ru https://*.tcsbank.ru
// https://*.tbank.ru https://*.nspk.ru https://*.t-static.ru on script/img/connect/
// style-src. Do NOT set frame-src for the card iframe — it breaks 3DS.

const TBANK_SCRIPT_URL = "https://integrationjs.t-static.ru/integration.js";
const SCRIPT_ID = "tbank-integration-js";
const READY_TIMEOUT_MS = 10000;
const READY_POLL_MS = 250;

// Subset of T-Bank's PaymentIntegrationStatus the UI reacts to.
export type TbankIntegrationStatus =
  | "NEW"
  | "PROCESSING"
  | "SUCCESS"
  | "REJECTED"
  | "CANCELED"
  | "EXPIRED"
  | "PROCESSING_ERROR"
  | "REFUNDED";

// Returns the T-Bank PaymentURL to embed (from our backend).
export type TbankPaymentStartCallback = () => Promise<string>;

export interface TbankFeatureConfig {
  language?: "ru" | "en";
  loadedCallback?: () => void;
  changedCallback?: (status: TbankIntegrationStatus) => void;
  // integration.js nests the status callback under `status` for the iframe / addcardIframe
  // features. We pass the callback in BOTH shapes (top-level + nested) so a SUCCESS/PROCESSING
  // event fires regardless of the exact runtime shape (codex PR #101 / terminal-verify gate).
  status?: { changedCallback?: (status: TbankIntegrationStatus) => void };
}

export interface TbankFeature {
  container: HTMLElement;
  config?: TbankFeatureConfig;
  paymentStartCallback: TbankPaymentStartCallback;
}

export interface TbankInitConfig {
  terminalKey: string;
  product: "eacq";
  features: {
    payment?: TbankFeature;
    iframe?: TbankFeature;
    addcardIframe?: TbankFeature;
  };
}

export interface PaymentIntegrationApi {
  init: (config: TbankInitConfig) => Promise<unknown>;
}

declare global {
  interface Window {
    PaymentIntegration?: PaymentIntegrationApi;
  }
}

let loaderPromise: Promise<PaymentIntegrationApi> | null = null;

export function loadTbankIntegration(): Promise<PaymentIntegrationApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("T-Bank integration needs a browser environment"));
  }
  if (window.PaymentIntegration) {
    return Promise.resolve(window.PaymentIntegration);
  }
  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise<PaymentIntegrationApi>((resolve, reject) => {
    const waitForGlobal = () => {
      const start = Date.now();
      const poll = () => {
        if (window.PaymentIntegration) {
          resolve(window.PaymentIntegration);
        } else if (Date.now() - start > READY_TIMEOUT_MS) {
          loaderPromise = null;
          reject(new Error("T-Bank PaymentIntegration global did not appear"));
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
      reject(new Error("Failed to load the T-Bank integration script"));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
}

// The TerminalKey is public (safe in the browser); read it from the build env.
export function tbankTerminalKey(): string {
  return import.meta.env.VITE_TBANK_TERMINAL_KEY ?? "";
}
