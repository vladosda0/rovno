import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { formatRubFromKopecks, type PaymentIntentRow } from "@/lib/billing";
import { PLANS } from "@/data/plans";

// Frontend-only refund REQUEST (audit M1 → handled manually for MVP). Emails Vlad
// via FormSubmit; touches no DB and no edge function. The endpoint uses
// FormSubmit's alias token (mapped to vlad@rovno.ai) rather than the naked email,
// so the address is not exposed in the frontend bundle. Requires a one-time
// "Activate Form" click in the email FormSubmit sent to vlad@rovno.ai before
// submissions deliver.
const REFUND_FORM_ENDPOINT = "https://formsubmit.co/ajax/69d1ca51fb2f4cef4cfd12f269d0b57e";
const MIN_REASON = 10;

interface RefundRequestFormProps {
  payment: PaymentIntentRow;
  userEmail: string;
  // Partial refund: set when the full-refund window (14 days) has passed.
  partial?: boolean;
  onDone?: () => void;
}

export function RefundRequestForm({ payment, userEmail, partial = false, onDone }: RefundRequestFormProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const planName = PLANS[payment.plan_code as keyof typeof PLANS]?.display_name ?? payment.plan_code;
  const reasonTrimmed = reason.trim();
  const canSubmit = reasonTrimmed.length >= MIN_REASON && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const response = await fetch(REFUND_FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: `Refund - ${payment.id}`,
          refund_type: partial ? "partial" : "full",
          payment_id: payment.id,
          payment_date: payment.confirmed_at ?? payment.created_at,
          amount_kopecks: payment.amount_kopecks,
          amount: formatRubFromKopecks(payment.amount_kopecks),
          plan_code: payment.plan_code,
          plan_display_name: planName,
          user_email: userEmail,
          reason: reasonTrimmed,
        }),
      });
      if (!response.ok) throw new Error("refund request failed");
      toast({ title: t("billing.refund.success") });
      setReason("");
      onDone?.();
    } catch {
      toast({ title: t("billing.refund.error"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-sp-3">
      <div className="space-y-1">
        <label htmlFor="refund-reason" className="text-body-sm font-medium text-foreground">
          {t("billing.refund.reasonLabel")}
        </label>
        <Textarea
          id="refund-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("billing.refund.reasonPlaceholder")}
          disabled={submitting}
          className="min-h-[90px]"
        />
        {reasonTrimmed.length > 0 && reasonTrimmed.length < MIN_REASON ? (
          <p className="text-caption text-destructive">{t("billing.refund.reasonMin")}</p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {t("billing.refund.submit")}
      </Button>
    </form>
  );
}
