import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";

interface OrderSummaryProps {
  planName: string;
  priceLabel: string;
  priceNote?: string;
  receiptEmail: string;
  autoRenew: boolean;
  onAutoRenewChange: (value: boolean) => void;
}

export function OrderSummary({
  planName,
  priceLabel,
  priceNote,
  receiptEmail,
  autoRenew,
  onAutoRenewChange,
}: OrderSummaryProps) {
  const { t } = useTranslation();

  return (
    <div className="glass rounded-panel p-sp-3 space-y-sp-3">
      <h2 className="text-h3 text-foreground">{t("billing.checkout.summary")}</h2>

      <dl className="space-y-2 text-body-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t("billing.checkout.plan")}</dt>
          <dd className="font-medium text-foreground">{planName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t("billing.checkout.period")}</dt>
          <dd className="text-foreground">{t("billing.checkout.periodMonthly")}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t("billing.checkout.price")}</dt>
          <dd className="font-semibold text-foreground">{priceLabel}</dd>
        </div>
        {priceNote ? (
          <div className="text-caption text-muted-foreground">{priceNote}</div>
        ) : null}
      </dl>

      <label className="flex cursor-pointer items-start gap-2">
        <Checkbox
          checked={autoRenew}
          onCheckedChange={(value) => onAutoRenewChange(value === true)}
          className="mt-0.5"
        />
        <span className="text-body-sm">
          <span className="block text-foreground">{t("billing.checkout.autoRenewLabel")}</span>
          <span className="block text-caption text-muted-foreground">
            {t("billing.checkout.autoRenewHint")}
          </span>
        </span>
      </label>

      {receiptEmail ? (
        <p className="text-caption text-muted-foreground">
          {t("billing.checkout.receiptTo", { email: receiptEmail })}
        </p>
      ) : null}

      <div className="space-y-0.5 border-t border-border pt-sp-2 text-caption text-muted-foreground">
        <p className="font-medium text-foreground">{t("billing.checkout.supportTitle")}</p>
        <p>{t("billing.checkout.supportEmail")}</p>
        <p>{t("billing.checkout.supportPhone")}</p>
      </div>
    </div>
  );
}
