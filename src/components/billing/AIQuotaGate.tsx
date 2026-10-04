import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { type AiUsageType, selectAiUsage, useTierQuota } from "@/hooks/useTierQuota";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { PLANS } from "@/data/plans";
import { formatRubFromKopecks, BILLING_ENABLED } from "@/lib/billing";

interface AIQuotaGateProps {
  usageType: AiUsageType;
  children: ReactNode;
}

// Hard paywall overlay shown when the AI usage slot for `usageType` is fully
// consumed. Children are rendered dimmed and inert behind it; they remount
// when the paywall appears or lifts.
export function AIQuotaGate({ usageType, children }: AIQuotaGateProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: quota } = useTierQuota();
  const dimmedRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // null until the first quota answer: a paywall that is already up when the
  // page loads must not pull focus into the sidebar on every navigation.
  const wasExceeded = useRef<boolean | null>(null);

  const usage = quota ? selectAiUsage(quota, usageType) : null;
  const exceeded = usage !== null && usage.limit > 0 && usage.used >= usage.limit;

  // React 18 has no `inert` JSX prop, so the attribute is set by hand. It must
  // also be removed by hand: when the paywall lifts React reuses this very node
  // for the composer, and a leftover `inert` would leave it dead until a reload.
  useEffect(() => {
    const el = dimmedRef.current;
    if (!exceeded || !el) return;
    el.setAttribute("inert", "");
    return () => el.removeAttribute("inert");
  }, [exceeded]);

  // The limit ran out in front of the user: the composer just went inert, so
  // move focus to the paywall, which is also what makes a screen reader read it.
  // Only when focus is nowhere, which is also where it lands when it was in the
  // composer (the composer remounts): never pull it out of a field elsewhere.
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
    <div className="relative">
      <div ref={dimmedRef} className="opacity-30 pointer-events-none" aria-hidden>
        {children}
      </div>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm focus:outline-none"
        role="alertdialog"
        aria-labelledby="ai-quota-gate-title"
        aria-describedby="ai-quota-gate-body"
      >
        <div className="max-w-md text-center space-y-3 p-sp-4 rounded-panel border bg-background/95 shadow-lg">
          <h3 id="ai-quota-gate-title" className="text-h3 font-semibold text-foreground">
            {t(`quota.gate.${usageType}.title`)}
          </h3>
          <p id="ai-quota-gate-body" className="text-body-sm text-muted-foreground">
            {t(`quota.gate.${usageType}.body`, { periodEnd })}
          </p>
          {nextPlan && (
            BILLING_ENABLED ? (
              <Button
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
              <Button variant="outline" disabled>{t("plans.dialog.soonCta")}</Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
