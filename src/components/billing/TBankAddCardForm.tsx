import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadTbankIntegration,
  tbankTerminalKey,
  type TbankIntegrationStatus,
} from "@/lib/tbank-widget";

// If the addcardIframe never reports loaded within this window, fall back to the
// hosted-page link instead of stranding an empty box (audit M3).
const ADDCARD_LOAD_TIMEOUT_MS = 8000;

interface TBankAddCardFormProps {
  // The T-Bank hosted card-binding PaymentURL (from tbank-add-card).
  paymentUrl: string;
  // Fires when T-Bank reports the binding succeeded (status SUCCESS).
  onSuccess?: () => void;
  // Fires when the widget can't mount, so the caller can show the hosted-page fallback.
  onFailed?: () => void;
}

// Embeds T-Bank's card-binding form via integration.js (features.addcardIframe),
// initialised once. The PAN is entered on T-Bank's side. Best-effort: if the script /
// VITE_TBANK_TERMINAL_KEY / init fails, it calls onFailed so the dialog can offer the
// hosted-page link; the RebillId is captured server-side via the AddCard notification.
export function TBankAddCardForm({ paymentUrl, onSuccess, onFailed }: TBankAddCardFormProps) {
  const { i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let alive = false;
    // Hard failure (no terminal key / script load / init reject): the iframe cannot mount,
    // so unmount the empty box and let the dialog show the hosted-page fallback.
    const hardFail = () => {
      if (!active) return;
      setFailed(true);
      onFailed?.();
    };
    // Any loaded/status signal means the form is alive (the backstop below then no-ops).
    const markAlive = () => {
      alive = true;
    };
    const onStatus = (status: TbankIntegrationStatus) => {
      markAlive();
      if (status === "SUCCESS") onSuccess?.();
    };
    const terminalKey = tbankTerminalKey();
    if (!terminalKey) {
      hardFail();
      return;
    }
    // Non-destructive backstop (audit M3 + codex P2): if the iframe never signals it is
    // alive (no loadedCallback / no status event), REVEAL the hosted-page fallback WITHOUT
    // tearing down the iframe, so a working-but-silent form stays usable.
    const timer = window.setTimeout(() => {
      if (active && !alive) onFailed?.();
    }, ADDCARD_LOAD_TIMEOUT_MS);
    loadTbankIntegration()
      .then((integration) => {
        if (!active || !containerRef.current) return undefined;
        return integration
          .init({
            terminalKey,
            product: "eacq",
            features: {
              addcardIframe: {
                container: containerRef.current,
                config: {
                  language: (i18n.language === "en" ? "en" : "ru") as "ru" | "en",
                  // Pass the callbacks in both the top-level and the nested `status` shape
                  // so SUCCESS fires regardless of integration.js's exact iframe shape.
                  loadedCallback: markAlive,
                  changedCallback: onStatus,
                  status: { changedCallback: onStatus },
                },
                paymentStartCallback: () => Promise.resolve(paymentUrl),
              },
            },
          })
          .catch(hardFail);
      })
      .catch(hardFail);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // A single init per paymentUrl; callbacks are stable from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentUrl]);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      data-testid="tbank-addcard"
      className="min-h-[260px] rounded-card border border-border bg-background/40"
    />
  );
}
