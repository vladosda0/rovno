import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BILLING_ENABLED } from "@/lib/billing";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";
import { trackEvent } from "@/lib/analytics";

export default function Success() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useRuntimeAuth();
  const intentId = params.get("intent");

  useEffect(() => {
    if (!BILLING_ENABLED) navigate("/#pricing", { replace: true });
  }, [navigate]);

  const intentQuery = usePaymentStatus(intentId);
  const { subscription, refetch } = useActiveSubscription();

  useEffect(() => {
    if (intentQuery.data?.status === "confirmed") {
      trackEvent("billing_payment_confirmed", { plan: intentQuery.data.plan_code });
    }
  }, [intentQuery.data?.status, intentQuery.data?.plan_code]);

  // The active-subscription row flips to the paid plan a beat AFTER the payment
  // reads confirmed (apply_confirmed_payment runs just after the status update
  // server-side, and react-query may still hold the pre-purchase row). Until the
  // subscription reflects the plan we just paid for, its period is the OLD one
  // (e.g. the Free period), which is exactly the wrong date users saw here. Poll
  // until it syncs, then show the real date.
  const paidPlan = intentQuery.data?.status === "confirmed"
    ? intentQuery.data.plan_code ?? null
    : null;
  const upgradeApplied = !!paidPlan && subscription?.plan_code === paidPlan;
  const needsSync = !!paidPlan && !upgradeApplied;
  const pollsRef = useRef(0);
  useEffect(() => {
    if (!needsSync) {
      pollsRef.current = 0;
      return;
    }
    const timer = window.setInterval(() => {
      if (pollsRef.current >= 20) {
        window.clearInterval(timer);
        return;
      }
      pollsRef.current += 1;
      void refetch();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [needsSync, refetch]);

  if (!BILLING_ENABLED) return null;

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Only show the period once the subscription reflects the paid plan, so we never
  // flash the stale (pre-upgrade) date.
  const endsAt = upgradeApplied && subscription?.current_period_ends_at
    ? dateFmt.format(new Date(subscription.current_period_ends_at))
    : null;
  const email = user?.email ?? "";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-sp-3 py-sp-6 text-center">
      <CheckCircle2 className="h-14 w-14 text-success" />
      <h1 className="mt-sp-3 text-h2 text-foreground">{t("billing.success.title")}</h1>
      {endsAt ? (
        <p className="mt-1 text-body text-muted-foreground">
          {t("billing.success.until", { date: endsAt })}
        </p>
      ) : null}
      {email ? (
        <p className="mt-sp-2 text-body-sm text-muted-foreground">
          {t("billing.success.receiptSent", { email })}
        </p>
      ) : null}
      <div className="mt-sp-4 flex w-full flex-col gap-sp-2">
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/home">{t("billing.success.ctaWorkspace")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/settings?tab=billing">{t("billing.success.ctaSettings")}</Link>
        </Button>
      </div>
    </div>
  );
}
