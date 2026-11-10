import { type ReactNode, useEffect, useRef, useState } from "react";
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
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const focusInPanel = useRef(false);
  // null until the first quota answer: a paywall that is already up when the
  // page loads must not pull focus into the sidebar on every navigation.
  const wasExceeded = useRef<boolean | null>(null);
  // What the status region says. Set from the effect, never during render, so
  // the region is empty on the paywall's first paint even with a cached quota,
  // and filling it is a change rather than text that was already there.
  const [announcement, setAnnouncement] = useState("");

  const nextPlan = quota?.plan_code === "free"
    ? "master"
    : quota?.plan_code === "master"
    ? "brigade"
    : null;
  const panelRole = nextPlan && BILLING_ENABLED ? "alertdialog" : "alert";
  const periodEnd = quota ? new Date(quota.period_end).toLocaleDateString(i18n.language) : "";
  const title = t(`quota.gate.${usageType}.title`);
  const body = t(`quota.gate.${usageType}.body`, { periodEnd });

  // The limit ran out in front of the user: the composer just went away, so
  // move focus to the paywall, which is also what makes a screen reader read it.
  // Only when focus is nowhere, which is also where it lands when it was in the
  // composer: never pull it out of a field elsewhere.
  useEffect(() => {
    if (!quota) {
      wasExceeded.current = null;
      // The panel can unmount while focused without a blur event.
      focusInPanel.current = false;
      setAnnouncement("");
      return;
    }
    let movedFocus = false;
    if (exceeded && wasExceeded.current === false) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        panelRef.current?.focus();
        movedFocus = document.activeElement === panelRef.current;
      }
    }
    // One announcement per paywall. Focus on the labelled panel already reads
    // it, and an alert panel announces itself when it appears, so the region
    // speaks only for an alertdialog that did not get focus. A refetch while the
    // paywall stays up changes nothing, and a filled region follows the panel's
    // text when it changes (another slot, a language switch).
    const text = `${title}. ${body}`;
    if (!exceeded) {
      setAnnouncement("");
    } else if (wasExceeded.current !== true) {
      setAnnouncement(panelRole === "alertdialog" && !movedFocus ? text : "");
    } else {
      setAnnouncement((current) => (current ? text : current));
    }
    // The paywall lifted under the user's focus: hand it back to the composer
    // instead of letting it fall to the page.
    if (!exceeded && focusInPanel.current) {
      liveRegionRef.current?.previousElementSibling
        ?.querySelector<HTMLElement>(
          "textarea:not([disabled]), input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
        )
        ?.focus();
    }
    if (!exceeded) focusInPanel.current = false;
    wasExceeded.current = exceeded;
  }, [quota, exceeded, panelRole, title, body]);

  // Rendered from the first paint and kept in the same place in both branches.
  const liveRegion = (
    <div ref={liveRegionRef} role="status" className="sr-only">{announcement}</div>
  );

  if (!quota || !exceeded) {
    return (
      <>
        {children}
        {liveRegion}
      </>
    );
  }

  return (
    <>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full space-y-2 rounded-panel border border-border bg-background p-sp-3 text-center shadow-lg focus:outline-none"
        role={panelRole}
        aria-labelledby="ai-quota-gate-title"
        aria-describedby="ai-quota-gate-body"
        onFocus={() => { focusInPanel.current = true; }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focusInPanel.current = false;
        }}
      >
        <h3 id="ai-quota-gate-title" className="text-body-sm font-semibold text-foreground">
          {title}
        </h3>
        <p id="ai-quota-gate-body" className="text-caption text-muted-foreground">
          {body}
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
      {liveRegion}
    </>
  );
}
