import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { formatRubFromKopecks, type PaymentIntentRow } from "@/lib/billing";
import { PLANS } from "@/data/plans";

// Frontend-only refund REQUEST (audit M1 → handled manually for MVP). Emails Vlad
// via FormSubmit; touches no DB and no edge function. Same transport as the
// landing newsletter form.
const REFUND_FORM_ENDPOINT = "https://formsubmit.co/ajax/vlad@rovno.ai";
const MIN_REASON = 10;

interface RefundRequestDialogProps {
  payment: PaymentIntentRow;
  userEmail: string;
}

export function RefundRequestDialog({ payment, userEmail }: RefundRequestDialogProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const shortId = payment.id.slice(0, 8);
  const planName = PLANS[payment.plan_code as keyof typeof PLANS]?.display_name ?? payment.plan_code;
  const amountLabel = formatRubFromKopecks(payment.amount_kopecks);
  const when = payment.confirmed_at ?? payment.created_at;
  const dateFmt = new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateLabel = dateFmt.format(new Date(when));

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
          _subject: `[Rovno Refund Request] Платёж ${shortId} — ${amountLabel}`,
          payment_id: payment.id,
          payment_date: when,
          amount_kopecks: payment.amount_kopecks,
          plan_code: payment.plan_code,
          plan_display_name: planName,
          user_email: userEmail,
          reason: reasonTrimmed,
          additional_comment: comment.trim(),
        }),
      });
      if (!response.ok) throw new Error("refund request failed");
      toast({ title: t("billing.refund.success") });
      setReason("");
      setComment("");
      setOpen(false);
    } catch {
      toast({ title: t("billing.refund.error"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-caption">
          {t("billing.refund.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("billing.refund.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("billing.refund.dialogSubtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-sp-3">
          <dl className="space-y-1 rounded-card border border-border bg-muted/30 p-sp-2 text-caption">
            <RefundRow label={t("billing.refund.paymentIdLabel")} value={shortId} />
            <RefundRow label={t("billing.refund.dateLabel")} value={dateLabel} />
            <RefundRow label={t("billing.refund.amountLabel")} value={amountLabel} />
            <RefundRow label={t("billing.refund.planLabel")} value={planName} />
            <RefundRow label={t("billing.refund.emailLabel")} value={userEmail} />
          </dl>

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

          <div className="space-y-1">
            <label htmlFor="refund-comment" className="text-body-sm font-medium text-foreground">
              {t("billing.refund.commentLabel")}
            </label>
            <Textarea
              id="refund-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={submitting}
              className="min-h-[60px]"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                {t("billing.refund.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {t("billing.refund.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RefundRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
