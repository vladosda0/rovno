import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentIntentRow } from "@/lib/billing";

// Refund REQUEST (audit M1 → handled manually for MVP). Sends the payment id +
// reason to the internal `send-refund-request` Edge Function, which derives the
// user's email server-side from the verified JWT and emails the billing inbox via
// Resend. This replaces the prior POST to formsubmit.co — a third-party form relay
// outside our data boundary that leaked billing PII (152-ФЗ, audit Fix E / P2-6).
// Touches no DB; the edge function owns sending.
const MIN_REASON = 10;
// Mirror the edge function's MAX_REASON so an over-long reason is blocked client-side
// with the inline counter rather than failing with a generic 400 toast.
const MAX_REASON = 4000;

interface RefundRequestFormProps {
  payment: PaymentIntentRow;
  // Partial refund: set when the full-refund window (14 days) has passed.
  partial?: boolean;
  onDone?: () => void;
}

export function RefundRequestForm({ payment, partial = false, onDone }: RefundRequestFormProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reasonTrimmed = reason.trim();
  const canSubmit = reasonTrimmed.length >= MIN_REASON && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("send-refund-request", {
        body: {
          payment_id: payment.id,
          reason: reasonTrimmed,
          partial,
        },
      });
      if (error) throw error;
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
          maxLength={MAX_REASON}
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
