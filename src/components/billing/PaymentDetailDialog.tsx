import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefundRequestForm } from "@/components/billing/RefundRequestForm";
import { buildReceiptHtml } from "@/lib/receipt";
import { formatRubFromKopecks, type PaymentIntentRow } from "@/lib/billing";
import { PLANS } from "@/data/plans";

// Full refunds are accepted within this window of the payment date; afterwards we
// offer a partial-refund request instead (per policy).
const REFUND_WINDOW_DAYS = 14;

interface PaymentDetailDialogProps {
  payment: PaymentIntentRow;
  userEmail: string;
  // The clickable element that opens the dialog (e.g. a payment-history row).
  trigger: ReactNode;
}

export function PaymentDetailDialog({ payment, userEmail, trigger }: PaymentDetailDialogProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [partialMode, setPartialMode] = useState(false);

  const planName = PLANS[payment.plan_code as keyof typeof PLANS]?.display_name ?? payment.plan_code;
  const amountLabel = formatRubFromKopecks(payment.amount_kopecks);
  const when = payment.confirmed_at ?? payment.created_at;
  const dateFmt = new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateLabel = dateFmt.format(new Date(when));
  const shortId = payment.id.slice(0, 8);

  const daysSince = (Date.now() - new Date(when).getTime()) / 86_400_000;
  const withinWindow = daysSince <= REFUND_WINDOW_DAYS;

  const downloadReceipt = () => {
    const html = buildReceiptHtml({
      payment,
      planName,
      dateLabel,
      userEmail,
      labels: {
        title: t("billing.payment.receiptDocTitle"),
        date: t("billing.refund.dateLabel"),
        id: t("billing.refund.paymentIdLabel"),
        plan: t("billing.refund.planLabel"),
        amount: t("billing.refund.amountLabel"),
        email: t("billing.refund.emailLabel"),
        note: t("billing.payment.receiptDocNote"),
      },
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rovno-receipt-${shortId}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPartialMode(false);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("billing.payment.detailTitle")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="receipt">
          <TabsList className="w-full">
            <TabsTrigger value="receipt" className="flex-1">
              {t("billing.payment.tabReceipt")}
            </TabsTrigger>
            <TabsTrigger value="refund" className="flex-1">
              {t("billing.payment.tabRefund")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="receipt" className="space-y-sp-3 pt-sp-2">
            <dl className="space-y-1 rounded-card border border-border bg-muted/30 p-sp-2 text-body-sm">
              <DetailRow label={t("billing.refund.dateLabel")} value={dateLabel} />
              <DetailRow label={t("billing.refund.paymentIdLabel")} value={shortId} />
              <DetailRow label={t("billing.refund.planLabel")} value={planName} />
              <DetailRow label={t("billing.refund.amountLabel")} value={amountLabel} />
              <DetailRow label={t("billing.refund.emailLabel")} value={userEmail} />
            </dl>
            <p className="text-caption text-muted-foreground">
              {t("billing.payment.receiptNote", { email: userEmail })}
            </p>
            <Button variant="outline" className="w-full" onClick={downloadReceipt}>
              <Download className="mr-1.5 h-4 w-4" />
              {t("billing.payment.download")}
            </Button>
          </TabsContent>

          <TabsContent value="refund" className="pt-sp-2">
            {payment.status !== "confirmed" ? (
              // The history lists confirmed + refunded rows, so a non-confirmed
              // row here is a full refund: never offer another refund request for
              // it. (partial_refund is excluded from the history for now — see
              // PaymentHistory; its remainder-refund UX is a separate follow-up.)
              <p className="text-body-sm text-muted-foreground">
                {t("billing.refund.alreadyRefunded")}
              </p>
            ) : withinWindow || partialMode ? (
              <RefundRequestForm
                payment={payment}
                partial={!withinWindow}
                onDone={() => setOpen(false)}
              />
            ) : (
              <div className="space-y-sp-2">
                <p className="text-body-sm text-muted-foreground">
                  {t("billing.refund.tooLate", { days: REFUND_WINDOW_DAYS })}
                </p>
                <button
                  type="button"
                  onClick={() => setPartialMode(true)}
                  className="text-caption font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                >
                  {t("billing.refund.partialCta")}
                </button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
