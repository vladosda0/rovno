import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadTbankWidget } from "@/lib/tbank-widget";

interface TBankIframeWidgetProps {
  paymentId: string;
  intentId: string;
  onReady?: () => void;
}

// Card-entry iframe. Best-effort: if the widget script/global is unavailable the
// container is replaced by a fallback note; status is still detected by polling.
export function TBankIframeWidget({ paymentId, intentId, onReady }: TBankIframeWidgetProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadTbankWidget()
      .then((widget) => {
        if (!active || !containerRef.current) return;
        try {
          // API per design §10.2 — verify against live T-Bank docs before go-live.
          widget.iframe?.connect?.({
            container: containerRef.current,
            paymentId,
            config: {
              language: "ru",
              theme: "light",
              successUrl: `${window.location.origin}/billing/success?intent=${intentId}`,
              failUrl: `${window.location.origin}/billing/fail?intent=${intentId}`,
            },
          });
          onReady?.();
        } catch {
          setFailed(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [paymentId, intentId, onReady]);

  if (failed) {
    return (
      <p className="text-caption text-muted-foreground">
        {t("billing.checkout.widgetFallback")}
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="tbank-iframe"
      className="min-h-[220px] rounded-card border border-border bg-background/40"
    />
  );
}
