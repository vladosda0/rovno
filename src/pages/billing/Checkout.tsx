import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderSummary } from "@/components/billing/OrderSummary";
import { CheckoutBlocked } from "@/components/billing/CheckoutBlocked";
import { TBankIframeWidget } from "@/components/billing/TBankIframeWidget";
import { TBankQuickPayWidget } from "@/components/billing/TBankQuickPayWidget";
import { getPlan, isPlanCode, PLANS } from "@/data/plans";
import { BILLING_ENABLED, formatRubFromKopecks, newIdempotencyKey, planRank } from "@/lib/billing";
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
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetFailed, setWidgetFailed] = useState(false);

  // All subscriptions are recurrent (no user-facing auto-renew toggle): checkout
  // always opts into monthly auto-renewal; cancel/resume lives in Settings →
  // billing. 152-ФЗ consent is the purchase itself plus the recurring disclosure
  // shown in OrderSummary.

  // #1: stable identity so TBankIframeWidget's effect does not re-run (and thus
  // re-`connect()` the iframe) on every Checkout re-render (status polling,
  // widget/auto-renew toggles).
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

  // Initialise the payment once subscription state is known and the user is not
  // already subscribed. Re-runs only on plan/auth change and explicit retry —
  // NOT on auto-renew toggle (M3).
  useEffect(() => {
    if (!allowed || authStatus === "loading" || subLoading || blocked) return;
    let cancelled = false;
    setIntentId(null);
    setPaymentId(null);
    setPaymentUrl(null);
    setWidgetReady(false);
    setWidgetFailed(false);
    trackEvent("billing_checkout_started", { plan: planCode });
    void initPayment
      .mutateAsync({
        plan_code: planCode,
        receipt_email: user?.email ?? "",
        auto_renew: true,
        idempotency_key: newIdempotencyKey(),
      })
      .then((res) => {
        if (cancelled) return;
        setIntentId(res.intent_id);
        setPaymentId(res.payment_id);
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
  }, [allowed, authStatus, subLoading, blocked, planCode, retryNonce]);

  // C1: reveal the hosted-page fallback if the widget never reports ready.
  useEffect(() => {
    if (!paymentId || widgetReady) return;
    const timer = window.setTimeout(() => setWidgetFailed(true), WIDGET_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [paymentId, widgetReady]);

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

          {initPayment.isPending && !paymentId ? (
            <p className="text-body-sm text-muted-foreground">{t("billing.checkout.preparing")}</p>
          ) : null}

          {paymentId && intentId ? (
            <>
              <div className="space-y-sp-2">
                <p className="text-body-sm font-medium text-foreground">
                  {t("billing.checkout.quickPayTitle")}
                </p>
                <TBankQuickPayWidget paymentId={paymentId} />
              </div>
              <p className="text-caption text-muted-foreground">{t("billing.checkout.orCard")}</p>
              <TBankIframeWidget
                paymentId={paymentId}
                intentId={intentId}
                onReady={handleWidgetReady}
              />
            </>
          ) : null}

          {/* C1: hosted-page fallback so payment still completes if the widget
              can't mount. */}
          {widgetFailed && paymentUrl ? (
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

          {initPayment.isError && !paymentId ? (
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
