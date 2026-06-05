import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderSummary } from "@/components/billing/OrderSummary";
import { CheckoutBlocked } from "@/components/billing/CheckoutBlocked";
import { TBankPaymentForm } from "@/components/billing/TBankPaymentForm";
import { getPlan, isPlanCode, PLANS } from "@/data/plans";
import { BILLING_ENABLED, CONSENT_VERSION, formatRubFromKopecks, newIdempotencyKey, planRank } from "@/lib/billing";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";
import { useInitPayment } from "@/hooks/useInitPayment";
import { isTerminalPaymentStatus, usePaymentStatus } from "@/hooks/usePaymentStatus";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

// If the JS widget hasn't reported ready within this window, surface the
// T-Bank hosted-page fallback link (audit C1).
const WIDGET_FALLBACK_MS = 5000;

export default function Checkout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { status: authStatus, user } = useRuntimeAuth();

  const planCode = (params.get("plan") ?? "").trim();
  const isValidPlan = isPlanCode(planCode);
  const plan = isValidPlan ? getPlan(planCode) : null;
  const allowed = BILLING_ENABLED && isValidPlan;

  // M2: never let a user with an active subscription buy the SAME or a LOWER tier
  // again (double charge). An upgrade (higher tier) is the exception — it is
  // allowed through, and tbank-init-payment charges only the catalogue
  // difference. Downgrades are scheduled from PlansDialog, never paid here.
  const { status: subStatus, subscription, isLoading: subLoading } = useActiveSubscription();
  const currentPlanCode = subscription?.plan_code ?? null;
  const isUpgrade =
    subStatus === "active" && isValidPlan && planRank(planCode) > planRank(currentPlanCode);
  const blocked = subStatus === "active" && !isUpgrade;

  // Upgrade pricing shown to the user = full new price − current plan's catalogue
  // price, mirroring tbank-init-payment's server-side math. Non-upgrade = full price.
  const currentCatalogueKopecks = currentPlanCode
    ? getPlan(currentPlanCode)?.amount_kopecks ?? 0
    : 0;
  const chargeKopecks = isUpgrade && plan
    ? Math.max(plan.amount_kopecks - currentCatalogueKopecks, 0)
    : plan?.amount_kopecks ?? 0;
  const currentPlanName = currentPlanCode
    ? PLANS[currentPlanCode]?.display_name ?? currentPlanCode
    : null;

  const [retryNonce, setRetryNonce] = useState(0);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetFailed, setWidgetFailed] = useState(false);
  // Recurring-charge consent (T-Bank go-live requirement): the customer must tick
  // this before we contact T-Bank. It gates the init call AND the rendered pay
  // widget / hosted-page fallback, so payment is impossible without it.
  const [consent, setConsent] = useState(false);

  // All subscriptions are recurrent (no user-facing auto-renew toggle): checkout
  // always opts into monthly auto-renewal; cancel/resume lives in Settings →
  // billing. The explicit `consent` checkbox below captures the user's agreement
  // to the recurring charges (T-Bank requirement) and gates the payment.

  // #1: stable identity so TBankPaymentForm's effect does not re-run (and thus
  // re-init the widget) on every Checkout re-render (status polling, etc.).
  const handleWidgetReady = useCallback(() => {
    setWidgetReady(true);
    setWidgetFailed(false);
  }, []);

  const initPayment = useInitPayment();
  const statusQuery = usePaymentStatus(intentId);

  // Invalid params or billing disabled -> back to pricing.
  useEffect(() => {
    if (!allowed) {
      navigate("/#pricing", { replace: true });
    }
  }, [allowed, navigate]);

  // Funnel (M1): fire ONCE when the payable checkout is actually shown. Kept out
  // of the consent-gated init effect so it isn't re-emitted on every consent
  // toggle / retry. (A distinct consent-tick analytics event is deferred to the
  // analytics workstream, which owns the AnalyticsEventName registry.)
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !allowed || subLoading || blocked) return;
    startedRef.current = true;
    trackEvent("billing_checkout_started", { plan: planCode });
  }, [allowed, subLoading, blocked, planCode]);

  // Initialise the payment once subscription state is known, the user is not
  // already subscribed, and consent is given. Re-runs on plan/auth change,
  // explicit retry, and the consent toggle (the payment gate).
  useEffect(() => {
    if (!allowed || authStatus === "loading" || subLoading || blocked || !consent) return;
    let cancelled = false;
    setIntentId(null);
    setPaymentUrl(null);
    setWidgetReady(false);
    setWidgetFailed(false);
    void initPayment
      .mutateAsync({
        plan_code: planCode,
        receipt_email: user?.email ?? "",
        auto_renew: true,
        idempotency_key: newIdempotencyKey(),
        consent_accepted: true,
        consent_version: CONSENT_VERSION,
      })
      .then((res) => {
        if (cancelled) return;
        setIntentId(res.intent_id);
        setPaymentUrl(res.payment_url);
        trackEvent("billing_init_payment_succeeded", { plan: planCode });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        trackEvent("billing_init_payment_failed", { plan: planCode });
        toast({
          title: t("billing.checkout.initError"),
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, authStatus, subLoading, blocked, consent, planCode, retryNonce]);

  // C1: reveal the hosted-page fallback if the widget never reports ready.
  useEffect(() => {
    if (!paymentUrl || widgetReady || !consent) return;
    const timer = window.setTimeout(() => setWidgetFailed(true), WIDGET_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [paymentUrl, widgetReady, consent]);

  // Navigate on terminal payment status (realtime + polling backup).
  useEffect(() => {
    const row = statusQuery.data;
    if (!row || !isTerminalPaymentStatus(row.status)) return;
    if (row.status === "confirmed") {
      navigate(`/billing/success?intent=${row.id}`, { replace: true });
    } else if (row.status === "rejected" || row.status === "cancelled") {
      const reason = row.error_code ? `&reason=${encodeURIComponent(row.error_code)}` : "";
      navigate(`/billing/fail?intent=${row.id}${reason}`, { replace: true });
    }
  }, [statusQuery.data, navigate]);

  if (!allowed || !plan) return null;
  if (subLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-sp-3 py-sp-4">
        <p className="text-body-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }
  if (blocked && subscription) {
    const dateFmt = new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const existingName =
      PLANS[subscription.plan_code as keyof typeof PLANS]?.display_name ?? subscription.plan_code;
    const endsLabel = subscription.current_period_ends_at
      ? dateFmt.format(new Date(subscription.current_period_ends_at))
      : null;
    return (
      <CheckoutBlocked
        planName={existingName}
        periodEndsLabel={endsLabel}
        manageHref="/settings?tab=billing"
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-sp-3 py-sp-4">
      <Button variant="ghost" size="sm" asChild className="mb-sp-3 -ml-2">
        <Link to="/#pricing">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("billing.checkout.back")}
        </Link>
      </Button>

      <h1 className="mb-sp-4 text-h2 text-foreground">{t("billing.checkout.title")}</h1>

      <div className="grid gap-sp-4 md:grid-cols-2">
        <OrderSummary
          planName={plan.display_name}
          priceLabel={formatRubFromKopecks(chargeKopecks)}
          priceNote={
            isUpgrade && currentPlanName
              ? t("billing.checkout.upgradeNote", { plan: currentPlanName })
              : undefined
          }
          receiptEmail={user?.email ?? ""}
        />

        <div className="glass space-y-sp-3 rounded-panel p-sp-3">
          <h2 className="text-h3 text-foreground">{t("billing.checkout.paymentMethods")}</h2>

          {/* T-Bank go-live requirement: explicit, user-ticked consent to the
              recurring charges. Gates init + the pay widget + the hosted fallback,
              so the customer cannot pay without agreeing. Locks once init starts
              (isPending/paymentUrl) so an un-tick→re-tick can't mint a duplicate
              payment intent. */}
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <Checkbox
                id="recurring-consent"
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
                disabled={initPayment.isPending || !!paymentUrl}
                aria-labelledby="recurring-consent-text"
                className="mt-0.5"
              />
              <span
                id="recurring-consent-text"
                className="text-caption leading-snug text-muted-foreground"
              >
                <Trans
                  i18nKey="billing.checkout.recurringConsent"
                  values={{
                    amount: formatRubFromKopecks(plan.amount_kopecks),
                    plan: plan.display_name,
                  }}
                  components={{
                    offer: (
                      <a
                        href="/offer"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      />
                    ),
                    refund: (
                      <a
                        href="/refund"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      />
                    ),
                  }}
                />
              </span>
            </div>
            {!consent ? (
              <p className="pl-6 text-caption text-muted-foreground/80">
                {t("billing.checkout.consentRequiredHint")}
              </p>
            ) : null}
          </div>

          {initPayment.isPending && !paymentUrl ? (
            <p className="text-body-sm text-muted-foreground">{t("billing.checkout.preparing")}</p>
          ) : null}

          {paymentUrl && consent ? (
            <TBankPaymentForm paymentUrl={paymentUrl} onReady={handleWidgetReady} />
          ) : null}

          {/* C1: hosted-page fallback so payment still completes if the widget
              can't mount. */}
          {widgetFailed && paymentUrl && consent ? (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="tbank-fallback-link"
              className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-sp-3 py-2 text-body-sm font-medium text-accent-foreground hover:bg-accent/90"
            >
              {t("billing.checkout.fallbackButton")}
            </a>
          ) : null}

          {/* M1: show retry whenever init SETTLED without a usable payment_url — not
              just on error. A 200 with payment_url:null (e.g. a missing/non-https
              PaymentURL, or an idempotent replay) would otherwise leave an empty panel
              with no widget, no hosted-page fallback, and no way forward. */}
          {!paymentUrl && (initPayment.isError || initPayment.isSuccess) ? (
            <Button variant="outline" onClick={() => setRetryNonce((n) => n + 1)}>
              {t("billing.fail.ctaRetry")}
            </Button>
          ) : null}

          <p className="border-t border-border pt-sp-2 text-caption text-muted-foreground">
            {t("billing.checkout.disclaimer", { email: user?.email ?? "" })}
          </p>
        </div>
      </div>
    </div>
  );
}
