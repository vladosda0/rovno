import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TBankAddCardForm } from "@/components/billing/TBankAddCardForm";
import { useAddCard } from "@/hooks/useAddCard";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

interface ChangePaymentMethodDialogProps {
  // The clickable element that opens the dialog (e.g. an "Изменить" button).
  trigger: ReactNode;
  // Called after a successful rebind so the caller can refetch the card on file.
  onChanged?: () => void;
}

// "Изменить карту": opens a T-Bank card-binding session (tbank-add-card) and embeds the
// addcardIframe widget so the user can save a new card with no real charge. On success
// the new RebillId becomes the card on file (captured server-side via the AddCard
// notification) and the next renewal uses it. If the inline widget can't mount, a
// hosted-page link is offered instead.
export function ChangePaymentMethodDialog({ trigger, onChanged }: ChangePaymentMethodDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [widgetFailed, setWidgetFailed] = useState(false);
  const addCard = useAddCard();
  // Delayed refetch timers from handleSuccess; cleared on unmount so they can never
  // fire against a torn-down tree (audit pass-2 nit).
  const refetchTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      refetchTimers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  const startBinding = () => {
    setPaymentUrl(null);
    setWidgetFailed(false);
    trackEvent("billing_change_card_started");
    addCard
      .mutateAsync()
      .then((res) => {
        if (res.payment_url) {
          setPaymentUrl(res.payment_url);
        } else {
          // No hosted URL means neither the inline widget nor a fallback can run.
          setWidgetFailed(true);
        }
      })
      .catch((error: unknown) => {
        toast({
          title: t("settings.billing.changeCardError"),
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        setOpen(false);
      });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      startBinding();
    }
  };

  const handleSuccess = () => {
    trackEvent("billing_change_card_succeeded");
    // The widget SUCCESS is client-side; the authoritative card-on-file update lands
    // server-to-server via the AddCard notification (writes card_bindings + copies the
    // new rebill_id onto the subscription). So we do NOT claim "done" here (audit H2) —
    // we say "processing" and refetch a few times to pick the change up once it lands.
    toast({ title: t("settings.billing.changeCardProcessing") });
    onChanged?.();
    refetchTimers.current.push(
      window.setTimeout(() => onChanged?.(), 2500),
      window.setTimeout(() => onChanged?.(), 6000),
    );
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.billing.changeCardTitle")}</DialogTitle>
          <DialogDescription>{t("settings.billing.changeCardDescription")}</DialogDescription>
        </DialogHeader>

        {addCard.isPending && !paymentUrl ? (
          <p className="text-body-sm text-muted-foreground">{t("billing.checkout.preparing")}</p>
        ) : null}

        {/* Keep the iframe mounted even after a soft timeout (codex P2): a working-but-
            silent form must not be torn down. The hosted-page link below appears as an
            additional option, not a replacement. */}
        {paymentUrl ? (
          <TBankAddCardForm
            paymentUrl={paymentUrl}
            onSuccess={handleSuccess}
            onFailed={() => setWidgetFailed(true)}
          />
        ) : null}

        {paymentUrl && widgetFailed ? (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="tbank-addcard-fallback-link"
            className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-sp-3 py-2 text-body-sm font-medium text-accent-foreground hover:bg-accent/90"
          >
            {t("settings.billing.changeCardHostedFallback")}
          </a>
        ) : null}

        {widgetFailed && !paymentUrl ? (
          <div className="space-y-sp-2">
            <p className="text-body-sm text-destructive">{t("settings.billing.changeCardError")}</p>
            <Button variant="outline" onClick={startBinding} disabled={addCard.isPending}>
              {t("billing.fail.ctaRetry")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
