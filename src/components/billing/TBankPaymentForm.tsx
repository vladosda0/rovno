import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadTbankIntegration,
  tbankTerminalKey,
  type TbankIntegrationStatus,
} from "@/lib/tbank-widget";

interface TBankPaymentFormProps {
  // The T-Bank hosted PaymentURL for this checkout (from tbank-init-payment).
  paymentUrl: string;
  // Fires once an embedded form reports loaded — clears the hosted-page fallback timer.
  onReady?: () => void;
  // Optional terminal status from the widget (SUCCESS / REJECTED / CANCELED / …).
  onStatus?: (status: TbankIntegrationStatus) => void;
}

// Embeds T-Bank's real web-acquiring widgets via integration.js: quick-pay buttons
// (features.payment) and the inline card form (features.iframe), initialised once for
// the page. Both features embed the same hosted PaymentURL inline instead of
// redirecting. Best-effort: if the script / VITE_TBANK_TERMINAL_KEY / init fails, it
// renders a fallback note and the caller's hosted-page link takes over; payment-status
// polling still completes the flow.
export function TBankPaymentForm({ paymentUrl, onReady, onStatus }: TBankPaymentFormProps) {
  const { t, i18n } = useTranslation();
  const quickPayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const terminalKey = tbankTerminalKey();
    if (!terminalKey) {
      setFailed(true);
      return;
    }
    loadTbankIntegration()
      .then((integration) => {
        if (!active || !quickPayRef.current || !cardRef.current) return undefined;
        const paymentStartCallback = () => Promise.resolve(paymentUrl);
        const config = {
          language: (i18n.language === "en" ? "en" : "ru") as "ru" | "en",
          loadedCallback: () => onReady?.(),
          changedCallback: (status: TbankIntegrationStatus) => onStatus?.(status),
        };
        return integration
          .init({
            terminalKey,
            product: "eacq",
            features: {
              payment: { container: quickPayRef.current, config, paymentStartCallback },
              iframe: { container: cardRef.current, config, paymentStartCallback },
            },
          })
          .catch(() => {
            if (active) setFailed(true);
          });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // A single init per paymentUrl. onReady/onStatus are stable from the caller
    // (useCallback); i18n.language is read once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentUrl]);

  if (failed) {
    return (
      <p className="text-caption text-muted-foreground">
        {t("billing.checkout.widgetFallback")}
      </p>
    );
  }

  return (
    <div className="space-y-sp-2">
      <p className="text-body-sm font-medium text-foreground">
        {t("billing.checkout.quickPayTitle")}
      </p>
      <div ref={quickPayRef} data-testid="tbank-quickpay" />
      <p className="text-caption text-muted-foreground">{t("billing.checkout.orCard")}</p>
      <div
        ref={cardRef}
        data-testid="tbank-iframe"
        className="min-h-[220px] rounded-card border border-border bg-background/40"
      />
    </div>
  );
}
