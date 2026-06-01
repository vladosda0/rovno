import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { type AiUsageType, selectAiUsage, useTierQuota } from "@/hooks/useTierQuota";

interface AIQuotaWarningProps {
  usageType: AiUsageType;
}

// Soft banner shown when a usage slot is between 90% and 100% consumed.
export function AIQuotaWarning({ usageType }: AIQuotaWarningProps) {
  const { t } = useTranslation();
  const { data: quota } = useTierQuota();
  if (!quota) return null;

  const { used, limit } = selectAiUsage(quota, usageType);
  if (limit <= 0) return null; // unlimited or unknown

  const remaining = Math.max(limit - used, 0);
  const pct = used / limit;
  if (pct < 0.9 || pct >= 1) return null;

  const nextPlan = quota.plan_code === "free"
    ? "master"
    : quota.plan_code === "master"
    ? "brigade"
    : null;

  return (
    <div className="rounded-pill border border-warning/30 bg-warning/10 px-sp-3 py-1.5 text-body-sm text-foreground">
      {t(`quota.warning.${usageType}`, { remaining, limit })}
      {nextPlan && (
        <Link to={`/billing/checkout?plan=${nextPlan}`} className="underline ml-1">
          {t(nextPlan === "brigade" ? "quota.warning.cta.brigade" : "quota.warning.cta")}
        </Link>
      )}
    </div>
  );
}
