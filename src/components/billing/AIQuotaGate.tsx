import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Shurik } from "@/components/ai/Shurik";
import { type AiUsageType, selectAiUsage, useTierQuota } from "@/hooks/useTierQuota";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { PLANS } from "@/data/plans";
import { formatRubFromKopecks, BILLING_ENABLED } from "@/lib/billing";

interface AIQuotaGateProps {
  usageType: AiUsageType;
  children: ReactNode;
}

export function useAiQuotaExceeded(usageType: AiUsageType): boolean {
  const { data: quota } = useTierQuota();
  const usage = quota ? selectAiUsage(quota, usageType) : null;
  return usage !== null && usage.limit > 0 && usage.used >= usage.limit;
}

/** Stands in the middle of an empty conversation above the limit card (docs-library, frame 4b). */
export function ShurikQuotaFigure() {
  return (
    <div className="flex min-h-[160px] flex-1 items-center justify-center" data-testid="shurik-quota-figure">
      <Shurik pose="working" size={136} decorative />
    </div>
  );
}

// Hard paywall: when the AI usage slot for `usageType` is fully consumed the
// composer is taken away and a card with the upgrade button stands in its
// place, where the thumb already is. The composer remounts when the limit lifts.
export function AIQuotaGate({ usageType, children }: AIQuotaGateProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: quota } = useTierQuota();
  const exceeded = useAiQuotaExceeded(usageType);
  const panelRef = useRef<HTMLDivElement>(null);
  // null until the first quota answer: a paywall that is already up when the
  // page loads must not pull focus into the sidebar on every navigation.
  const wasExceeded = useRef<boolean | null>(null);

  // The limit ran out in front of the user: the composer just went away, so
  // move focus to the paywall, which is also what makes a screen reader read it.
  // Only when focus is nowhere, which is also where it lands when it was in the
  // composer: never pull it out of a field elsewhere.
  useEffect(() => {
    if (!quota) {
      wasExceeded.current = null;
      return;
    }
    if (exceeded && wasExceeded.current === false) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        panelRef.current?.focus();
      }
    }
    wasExceeded.current = exceeded;
  }, [quota, exceeded]);

  if (!quota || !exceeded) return <>{children}</>;

  const periodEnd = new Date(quota.period_end).toLocaleDateString(i18n.language);
  const nextPlan = quota.plan_code === "free"
    ? "master"
    : quota.plan_code === "master"
    ? "brigade"
    : null;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="w-full space-y-2 rounded-panel border border-border bg-background p-sp-3 text-center shadow-lg focus:outline-none"
      role="alertdialog"
      aria-labelledby="ai-quota-gate-title"
      aria-describedby="ai-quota-gate-body"
    >
      <h3 id="ai-quota-gate-title" className="text-body-sm font-semibold text-foreground">
        {t(`quota.gate.${usageType}.title`)}
      </h3>
      <p id="ai-quota-gate-body" className="text-caption text-muted-foreground">
        {t(`quota.gate.${usageType}.body`, { periodEnd })}
      </p>
      {nextPlan && (
        BILLING_ENABLED ? (
          <Button
            className="h-10 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => {
              trackEvent("quota_gate_upgrade_clicked", {
                usage_type: usageType,
                plan: quota.plan_code,
              });
              navigate(`/billing/checkout?plan=${nextPlan}`);
            }}
          >
            {t(nextPlan === "brigade" ? "quota.gate.cta.brigade" : "quota.gate.cta", {
              price: formatRubFromKopecks(PLANS[nextPlan]?.amount_kopecks ?? 0),
            })}
          </Button>
        ) : (
          // Billing off (prelaunch): no checkout flow exists yet, so show a
          // disabled "soon" affordance (matching PlansDialog) instead of
          // bouncing the user out to the marketing /#pricing page mid-session.
          <Button variant="outline" className="h-10 w-full" disabled>{t("plans.dialog.soonCta")}</Button>
        )
      )}
    </div>
  );
}
