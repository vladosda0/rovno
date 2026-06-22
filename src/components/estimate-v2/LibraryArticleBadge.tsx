import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LibraryArticleBadgeProps {
  /** When provided, the badge is a button that opens the resource modal. */
  onOpen?: () => void;
  className?: string;
  /** Override the tooltip text (defaults to the canonical-library label). */
  label?: string;
}

/**
 * Small Rovno mark shown on estimate rows whose item is linked to the canonical
 * library (system_*_article_id != null). Muted by default, fully opaque on
 * hover; clicking opens the universal resource modal.
 */
export function LibraryArticleBadge({ onOpen, className, label }: LibraryArticleBadgeProps) {
  const { t } = useTranslation();
  const tooltip = label ?? t("estimate.library.indicatorTooltip");

  const mark = (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="h-4 w-4 rounded-[3px] opacity-60 transition-opacity group-hover/lib:opacity-100"
    />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onOpen ? (
          <button
            type="button"
            aria-label={tooltip}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className={cn(
              "group/lib inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              className,
            )}
          >
            {mark}
          </button>
        ) : (
          <span
            aria-label={tooltip}
            className={cn("group/lib inline-flex h-4 w-4 shrink-0 items-center justify-center", className)}
          >
            {mark}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
