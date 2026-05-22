import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadTbankWidget } from "@/lib/tbank-widget";

interface TBankQuickPayWidgetProps {
  paymentId: string;
}

// Quick-pay buttons (T-Pay, СБП, SberPay, Alfa Pay). Best-effort: if the widget
// script/global is unavailable the container is replaced by a fallback note and
// the user pays via the card iframe; status is still detected by polling.
export function TBankQuickPayWidget({ paymentId }: TBankQuickPayWidgetProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadTbankWidget()
      .then((widget) => {
        if (!active || !containerRef.current) return;
        try {
          // API per design §10.3 — verify against live T-Bank docs before go-live.
          widget.speedpay?.init?.({
            container: containerRef.current,
            paymentId,
            methods: ["tpay", "sbp", "sberpay", "alfapay"],
          });
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
  }, [paymentId]);

  if (failed) {
    return (
      <p className="text-caption text-muted-foreground">
        {t("billing.checkout.widgetFallback")}
      </p>
    );
  }

  return <div ref={containerRef} data-testid="tbank-quickpay" />;
}
