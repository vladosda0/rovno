import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Honest placeholder for a money value hidden by finance visibility.
 * Renders an em dash with a lock affordance — NEVER a fake ₽0.
 */
export function RedactedMoney({ className, showIcon = true }: { className?: string; showIcon?: boolean }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}
          aria-label={t("projectData.redactedMoney.tooltip")}
          data-testid="redacted-money"
        >
          —
          {showIcon && <Lock className="h-3 w-3 opacity-60" aria-hidden />}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("projectData.redactedMoney.tooltip")}</TooltipContent>
    </Tooltip>
  );
}
