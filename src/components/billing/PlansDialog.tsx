import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";
import { PLANS } from "@/data/plans";
import { TIER_LIMITS, type TierCode } from "@/data/tier-limits";
import { BILLING_ENABLED, formatRubFromKopecks, planRank } from "@/lib/billing";
import { useActiveSubscription } from "@/hooks/useActiveSubscription";

// tbank RPCs are not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

const ORDER: TierCode[] = ["free", "master", "brigade"];

// Renders -1 (unlimited) as ∞.
function lim(value: number): string {
  return value < 0 ? "∞" : String(value);
}

interface PlansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
}

// In-app plan comparison + plan change. Upgrades (higher tier) go to the T-Bank
// checkout, which charges the prorated difference. Downgrades to a cheaper PAID
// plan are SCHEDULED via tbank_schedule_plan_change (no charge now; the current
// plan + limits stay until the period ends, then it renews onto the cheaper
// plan). Downgrade to Free is cancellation, handled in the subscription section,
// so Free shows no CTA when the user is on a paid plan.
export function PlansDialog({ open, onOpenChange, currentPlan }: PlansDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { subscription, refetch } = useActiveSubscription();
  const [downgradeTo, setDowngradeTo] = useState<TierCode | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSelect = (code: TierCode) => {
    trackEvent("plans_dialog_plan_selected", { from: currentPlan, to: code });
    if (planRank(code) > planRank(currentPlan)) {
      // Upgrade → checkout (the prorated difference is charged server-side).
      onOpenChange(false);
      navigate(`/billing/checkout?plan=${code}`);
      return;
    }
    // Downgrade to a cheaper paid plan → confirm, then schedule (no charge now).
    setDowngradeTo(code);
  };

  const confirmDowngrade = async () => {
    if (!downgradeTo || !subscription) return;
    setSubmitting(true);
    // The downgrade is applied by the renewal cron, which only charges
    // auto-renewing subs. Turn auto-renewal on first as an explicit step (the RPC
    // refuses to schedule otherwise) so the cheaper plan is charged at the period
    // boundary instead of the subscription lapsing to Free.
    if (!subscription.auto_renew) {
      const renew = await rawSupabase.rpc("tbank_set_auto_renew", {
        p_subscription_id: subscription.id,
        p_auto_renew: true,
      });
      if (renew.error) {
        setSubmitting(false);
        toast({ title: t("plans.dialog.downgradeError"), variant: "destructive" });
        return;
      }
    }
    const { error } = await rawSupabase.rpc("tbank_schedule_plan_change", {
      p_subscription_id: subscription.id,
      p_target_plan_code: downgradeTo,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: t("plans.dialog.downgradeError"), variant: "destructive" });
      return;
    }
    trackEvent("billing_downgrade_scheduled", { from: currentPlan, to: downgradeTo });
    toast({
      title: t("plans.dialog.downgradeScheduled", {
        plan: PLANS[downgradeTo]?.display_name ?? downgradeTo,
      }),
    });
    setDowngradeTo(null);
    refetch();
    onOpenChange(false);
  };

  const endsAtLabel = subscription?.current_period_ends_at
    ? new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(subscription.current_period_ends_at))
    : null;
  const downgradeName = downgradeTo ? PLANS[downgradeTo]?.display_name ?? downgradeTo : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("plans.dialog.title")}</DialogTitle>
            <DialogDescription>{t("plans.dialog.subtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-sp-2 sm:grid-cols-3">
            {ORDER.map((code) => {
              const plan = PLANS[code];
              const limits = TIER_LIMITS[code];
              const isCurrent = code === currentPlan;
              const isPaid = code !== "free";
              const isUpgrade = planRank(code) > planRank(currentPlan);

              return (
                <div
                  key={code}
                  className={cn(
                    "flex flex-col rounded-panel border p-sp-3",
                    isCurrent ? "border-accent ring-1 ring-accent/40" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body font-semibold text-foreground">{plan.display_name}</span>
                    {isCurrent && <Badge variant="secondary" className="text-[10px]">{t("plans.dialog.currentBadge")}</Badge>}
                  </div>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {plan.amount_kopecks > 0
                      ? `${formatRubFromKopecks(plan.amount_kopecks)} ${t("plans.dialog.perMonth")}`
                      : t("plans.dialog.freePrice")}
                  </p>

                  <ul className="mt-sp-2 flex-1 space-y-1 text-caption text-muted-foreground">
                    <li>{t("plans.dialog.limit.chat", { value: limits.ai_chat_per_month })}</li>
                    <li>{t("plans.dialog.limit.doc", { value: lim(limits.ai_doc_per_month) })}</li>
                    <li>{t("plans.dialog.limit.photo", { value: lim(limits.ai_photo_per_month) })}</li>
                    <li>{t("plans.dialog.limit.estimates", { value: lim(limits.estimates_total) })}</li>
                    <li>{t("plans.dialog.limit.editors", { value: lim(limits.editors_per_project) })}</li>
                    {limits.can_create_organization && <li className="flex items-center gap-1"><Check className="h-3 w-3 text-accent" />{t("plans.dialog.limit.org")}</li>}
                  </ul>

                  <div className="mt-sp-3">
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>{t("plans.dialog.currentCta")}</Button>
                    ) : isPaid ? (
                      BILLING_ENABLED ? (
                        <Button className="w-full" onClick={() => handleSelect(code)}>
                          {isUpgrade ? t("plans.dialog.upgradeCta") : t("plans.dialog.switchCta")}
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" disabled>{t("plans.dialog.soonCta")}</Button>
                      )
                    ) : (
                      // Free, when the user is on a paid plan: downgrade = cancel,
                      // managed in the subscription section.
                      <p className="text-center text-caption text-muted-foreground">{t("plans.dialog.downgradeNote")}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={downgradeTo !== null} onOpenChange={(o) => { if (!o) setDowngradeTo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("plans.dialog.downgradeConfirmTitle", { plan: downgradeName })}</AlertDialogTitle>
            <AlertDialogDescription>
              {endsAtLabel
                ? t("plans.dialog.downgradeConfirmBody", {
                    current: PLANS[currentPlan]?.display_name ?? currentPlan,
                    plan: downgradeName,
                    date: endsAtLabel,
                  })
                : t("plans.dialog.downgradeConfirmBodyNoDate", { plan: downgradeName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t("plans.dialog.downgradeConfirmKeep")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDowngrade} disabled={submitting}>
              {t("plans.dialog.downgradeConfirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
