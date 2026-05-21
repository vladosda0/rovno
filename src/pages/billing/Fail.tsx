import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BILLING_ENABLED } from "@/lib/billing";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";
import { isPlanCode } from "@/data/plans";
import { trackEvent } from "@/lib/analytics";

export default function Fail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intentId = params.get("intent");
  const reasonParam = params.get("reason");

  useEffect(() => {
    if (!BILLING_ENABLED) navigate("/pricing", { replace: true });
  }, [navigate]);

  const intentQuery = usePaymentStatus(intentId);
  const intent = intentQuery.data;

  useEffect(() => {
    if (intent && (intent.status === "rejected" || intent.status === "cancelled")) {
      trackEvent("billing_payment_failed", {
        plan: intent.plan_code,
        code: intent.error_code ?? reasonParam ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.status]);

  if (!BILLING_ENABLED) return null;

  const errorCode = intent?.error_code ?? reasonParam ?? null;
  const localizedByCode = errorCode
    ? t(`billing.fail.codes.${errorCode}`, { defaultValue: "" })
    : "";
  const reason = localizedByCode || intent?.error_message || t("billing.fail.genericReason");
  const retryPlan = intent && isPlanCode(intent.plan_code) ? intent.plan_code : null;

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-sp-3 py-sp-6 text-center">
      <XCircle className="h-14 w-14 text-destructive" />
      <h1 className="mt-sp-3 text-h2 text-foreground">{t("billing.fail.title")}</h1>
      <p className="mt-sp-2 text-body-sm text-muted-foreground">{reason}</p>
      <div className="mt-sp-4 flex w-full flex-col gap-sp-2">
        {retryPlan ? (
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to={`/billing/checkout?plan=${retryPlan}`}>{t("billing.fail.ctaRetry")}</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link to="/pricing">{t("billing.fail.ctaBack")}</Link>
        </Button>
      </div>
    </div>
  );
}
