import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { type AiUsageType, selectAiUsage, useTierQuota } from "@/hooks/useTierQuota";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface AIQuotaGateProps {
  usageType: AiUsageType;
  children: ReactNode;
}

// Hard paywall overlay shown when the AI usage slot for `usageType` is fully
// consumed. Children stay mounted (dimmed, non-interactive) behind it.
export function AIQuotaGate({ usageType, children }: AIQuotaGateProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: quota } = useTierQuota();

  if (!quota) return <>{children}</>;

  const { used, limit } = selectAiUsage(quota, usageType);
  const exceeded = limit > 0 && used >= limit;
  if (!exceeded) return <>{children}</>;

  const periodEnd = new Date(quota.period_end).toLocaleDateString(i18n.language);
  const nextPlan = quota.plan_code === "free"
    ? "master"
    : quota.plan_code === "master"
    ? "brigade"
    : null;

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none" aria-hidden>
        {children}
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        role="alertdialog"
        aria-live="polite"
        aria-labelledby="ai-quota-gate-title"
      >
        <div className="max-w-md text-center space-y-3 p-sp-4 rounded-panel border bg-background/95 shadow-lg">
          <h3 id="ai-quota-gate-title" className="text-h3 font-semibold text-foreground">
            {t(`quota.gate.${usageType}.title`)}
          </h3>
          <p className="text-body-sm text-muted-foreground">
            {t(`quota.gate.${usageType}.body`, { periodEnd })}
          </p>
          {nextPlan && (
            <Button
              onClick={() => {
                trackEvent("quota_gate_upgrade_clicked", {
                  usage_type: usageType,
                  plan: quota.plan_code,
                });
                navigate(`/billing/checkout?plan=${nextPlan}`);
              }}
            >
              {t(nextPlan === "brigade" ? "quota.gate.cta.brigade" : "quota.gate.cta")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
