import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { CheckoutBlocked } from "@/components/billing/CheckoutBlocked";
import { TBankPaymentForm } from "@/components/billing/TBankPaymentForm";
import { getPlan, isPlanCode, PLANS } from "@/data/plans";
import { BILLING_ENABLED, CONSENT_VERSION, formatRubFromKopecks, newIdempotencyKey, ONE_TIME_CONSENT_VERSION, planRank } from "@/lib/billing";
import type { TbankIntegrationStatus } from "@/lib/tbank-widget";
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
  // TEMP (T-Bank Тест 1 certification): opt-out of auto-renewal → one-time,
  // non-recurrent payment. autoRenew=false makes init skip Recurrent="Y" so the
  // charge is a single payment. Remove this + the toggle UI after the cert passes.
  const [autoRenew, setAutoRenew] = useState(true);
  const [showRenewOptOut, setShowRenewOptOut] = useState(false);

  // Payment gate. Recurring mode requires the ticked checkbox; one-time mode
  // (autoRenew=false) is only reachable by flipping the opt-out toggle, whose
  // own label carries the one-time agreement — so flipping it IS the consent.
  const consentGiven = autoRenew ? consent : true;

  // #1: stable identity so TBankPaymentForm's effect does not re-run (and thus
  // re-init the widget) on every Checkout re-render (status polling, etc.).
  const handleWidgetReady = useCallback(() => {
    setWidgetReady(true);
    setWidgetFailed(false);
  }, []);
  // H: surface the hosted-page fallback IMMEDIATELY on a hard widget failure
  // (e.g. missing VITE_TBANK_TERMINAL_KEY) instead of waiting out the 5s C1 timer.
  const handleWidgetFailed = useCallback(() => {
    setWidgetFailed(true);
  }, []);

  const initPayment = useInitPayment();
  const statusQuery = usePaymentStatus(intentId);
  // I: when the widget reports SUCCESS, refetch the payment status immediately so
  // navigation to /billing/success doesn't wait up to a full 4s poll cycle. The
  // webhook + poll remain the source of truth for `confirmed`; this only collapses
  // the latency. refetch is referentially stable from react-query.
  const { refetch: refetchStatus } = statusQuery;
  const handleWidgetStatus = useCallback(
    (status: TbankIntegrationStatus) => {
      if (status === "SUCCESS") void refetchStatus();
    },
    [refetchStatus],
  );

  // Once init has produced a payment_url, freeze the consent/mode controls so an
  // un-tick→re-tick (or mode flip) can't mint a duplicate payment intent.
  const consentLocked = initPayment.isPending || !!paymentUrl;

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
    if (!allowed || authStatus === "loading" || subLoading || blocked || !consentGiven) return;
    let cancelled = false;
    setIntentId(null);
    setPaymentUrl(null);
    setWidgetReady(false);
    setWidgetFailed(false);
    void initPayment
      .mutateAsync({
        plan_code: planCode,
        receipt_email: user?.email ?? "",
        auto_renew: autoRenew,
        idempotency_key: newIdempotencyKey(),
        consent_accepted: true,
        // F: a one-time (auto_renew=false) checkout must record the one-time
        // consent text the user agreed to, not the recurring version (audit Fix F).
        consent_version: autoRenew ? CONSENT_VERSION : ONE_TIME_CONSENT_VERSION,
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
  }, [allowed, authStatus, subLoading, blocked, consentGiven, autoRenew, planCode, retryNonce]);

  // C1: reveal the hosted-page fallback if the widget never reports ready.
  useEffect(() => {
    if (!paymentUrl || widgetReady || !consentGiven) return;
    const timer = window.setTimeout(() => setWidgetFailed(true), WIDGET_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [paymentUrl, widgetReady, consentGiven]);

  // Navigate on terminal payment status (realtime + polling backup).
  useEffect(() => {
    const row = statusQuery.data;
    if (!row || !isTerminalPaymentStatus(row.status)) return;
    if (row.status === "confirmed") {
      navigate(`/billing/success?intent=${row.id}`, { replace: true });
    } else if (row.status === "rejected" || row.status === "cancelled") {
      const reason = row.error_code ? `&reason=${encodeURIComponent(row.error_code)}` : "";
      navigate(`/billing/fail?intent=${row.id}${reason}`, { replace: true });
    } else if (row.status === "refunded" || row.status === "partial_refund") {
      // G: usePaymentStatus marks refunded/partial_refund terminal (polling stops),
      // so without a nav branch here the user is stranded on a live-looking checkout
      // (audit Fix G / P2-7). Route to the fail screen with a refund-specific reason.
      navigate(`/billing/fail?intent=${row.id}&reason=${row.status}`, { replace: true });
    }
  }, [statusQuery.data, navigate]);

  if (!allowed || !plan) return null;
  if (subLoading) {
    return (
      <div className="mx-auto w-full max-w-xl px-sp-3 py-sp-4">
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
    <div className="mx-auto w-full max-w-xl px-sp-3 py-sp-4">
      <Button variant="ghost" size="sm" asChild className="mb-sp-3 -ml-2">
        <Link to="/#pricing">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("billing.checkout.back")}
        </Link>
      </Button>

      <h1 className="mb-sp-4 text-h2 text-foreground">{t("billing.checkout.title")}</h1>

      <div className="glass space-y-sp-3 rounded-panel p-sp-3">
        {/* Order summary. The big figure is the amount due TODAY — the upgrade
            difference when upgrading, otherwise the full plan price. The smaller
            note below spells out the recurring / one-time terms (and, for an
            upgrade, the full monthly price that applies from next period). */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-h3 text-foreground">{plan.display_name}</span>
            <span className="text-h3 text-foreground">
              {formatRubFromKopecks(chargeKopecks)}
              {!isUpgrade && autoRenew ? (
                <span className="ml-1 text-body-sm font-normal text-muted-foreground">
                  {t("billing.checkout.perMonth")}
                </span>
              ) : null}
            </span>
          </div>
          {isUpgrade && currentPlanName ? (
            <p className="text-caption text-muted-foreground">
              {autoRenew
                ? t("billing.checkout.upgradeRecurringNote", {
                    plan: currentPlanName,
                    full: formatRubFromKopecks(plan.amount_kopecks),
                  })
                : t("billing.checkout.upgradeOneTimeNote", { plan: currentPlanName })}
            </p>
          ) : (
            <p className="text-caption text-muted-foreground">
              {autoRenew
                ? t("billing.checkout.recurringNote")
                : t("billing.checkout.oneTimeNote")}
            </p>
          )}
          {user?.email ? (
            <p className="text-caption text-muted-foreground">
              {t("billing.checkout.receiptTo", { email: user.email })}
            </p>
          ) : null}
        </div>

        {/* Consent / payment-mode gate (T-Bank go-live requirement): explicit
            agreement before we contact T-Bank, gating init + the pay widget +
            the hosted fallback. Recurring mode → a ticked checkbox; opting out
            flips to a one-time charge whose agreement lives in the toggle label
            itself. Frozen once init mints a payment_url so a re-toggle can't
            create a duplicate intent. */}
        <div className="space-y-2 border-t border-border pt-sp-3">
          {/* Recurring consent — hidden in one-time mode (#3): the toggle below
              carries its own agreement. */}
          {autoRenew ? (
            <>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="recurring-consent"
                  checked={consent}
                  onCheckedChange={(value) => setConsent(value === true)}
                  disabled={consentLocked}
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
            </>
          ) : null}

          {/* Opt-out → one-time payment. Hidden once recurring is agreed (#2).
              The toggle's own label carries the one-time agreement (#3). TEMP for
              T-Bank Тест 1 cert; remove with the autoRenew plumbing afterwards. */}
          {!consent ? (
            !showRenewOptOut ? (
              <button
                type="button"
                onClick={() => setShowRenewOptOut(true)}
                disabled={consentLocked}
                className="text-caption text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                {t("billing.checkout.autoRenewOptOutLink")}
              </button>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-border p-2">
                <Switch
                  id="one-time-payment"
                  checked={!autoRenew}
                  onCheckedChange={(value) => setAutoRenew(!(value === true))}
                  disabled={consentLocked}
                  aria-labelledby="one-time-consent-text"
                  className="mt-0.5"
                />
                <span
                  id="one-time-consent-text"
                  className="text-caption leading-snug text-muted-foreground"
                >
                  <Trans
                    i18nKey="billing.checkout.oneTimeToggleConsent"
                    values={{
                      amount: formatRubFromKopecks(chargeKopecks),
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
            )
          ) : null}
        </div>

        {initPayment.isPending && !paymentUrl ? (
          <p className="text-body-sm text-muted-foreground">{t("billing.checkout.preparing")}</p>
        ) : null}

        {paymentUrl && consentGiven ? (
          <TBankPaymentForm
            paymentUrl={paymentUrl}
            onReady={handleWidgetReady}
            onFailed={handleWidgetFailed}
            onStatus={handleWidgetStatus}
          />
        ) : null}

        {/* C1: hosted-page fallback so payment still completes if the widget can't mount. */}
        {widgetFailed && paymentUrl && consentGiven ? (
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

        {/* M1: show retry whenever init SETTLED without a usable payment_url. */}
        {!paymentUrl && (initPayment.isError || initPayment.isSuccess) ? (
          <Button variant="outline" onClick={() => setRetryNonce((n) => n + 1)}>
            {t("billing.fail.ctaRetry")}
          </Button>
        ) : null}

        <p className="border-t border-border pt-sp-2 text-caption text-muted-foreground">
          {t("billing.checkout.footerNote")}
        </p>
      </div>
    </div>
  );
}
