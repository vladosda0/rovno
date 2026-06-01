import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trackEvent } from "@/lib/analytics";
import { PLANS } from "@/data/plans";
import { type TierPlanCode, planMeets, useTierQuota } from "@/hooks/useTierQuota";

interface TierLockTooltipProps {
  requiredPlan: Exclude<TierPlanCode, "free">;
  children: ReactNode; // the unlocked control, rendered when the plan qualifies
  lockedLabel?: string; // label for the locked CTA button
  feature?: string; // analytics tag
}

// Renders `children` when the user's plan meets `requiredPlan`; otherwise a
// locked CTA that routes to pricing. While the quota is loading we render
// children optimistically — the backend enforces the real gate regardless.
export function TierLockTooltip({
  requiredPlan,
  children,
  lockedLabel,
  feature,
}: TierLockTooltipProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: quota } = useTierQuota();

  if (!quota || planMeets(quota.plan_code, requiredPlan)) {
    return <>{children}</>;
  }

  const planLabel = PLANS[requiredPlan]?.display_name ?? requiredPlan;
  const label = lockedLabel ?? t("tier.lock.tooltip", { plan: planLabel });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              trackEvent("tier_lock_cta_clicked", {
                required_plan: requiredPlan,
                plan: quota.plan_code,
                feature: feature ?? null,
              });
              navigate("/#pricing");
            }}
          >
            <Lock className="h-4 w-4 mr-1.5" />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("tier.lock.tooltip", { plan: planLabel })}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
