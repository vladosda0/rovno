import { useTranslation } from "react-i18next";
import type { DocMediaVisibilityClass } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const LABEL_KEYS: Record<DocMediaVisibilityClass, string> = {
  shared_project: "documents.visibility.shared",
  internal: "documents.visibility.internal",
};

const DESCRIPTION_KEYS: Record<DocMediaVisibilityClass, string> = {
  shared_project: "documents.visibility.sharedDescription",
  internal: "documents.visibility.internalDescription",
};

/**
 * Fallback copy when `visibility_class` is missing (e.g. legacy mock rows).
 * DB defaults unclassified rows to shared_project; we do not imply a finer ACL model.
 */
export const VISIBILITY_CLASS_FALLBACK_LABEL_KEY = "documents.visibility.unknown";
export const VISIBILITY_CLASS_FALLBACK_DESCRIPTION_KEY =
  "documents.visibility.unknownDescription";

export function VisibilityClassBadge({
  visibilityClass,
  className,
}: {
  visibilityClass?: DocMediaVisibilityClass | null;
  className?: string;
}) {
  const { t } = useTranslation();

  const isUnknown = visibilityClass == null;
  const labelKey = isUnknown
    ? VISIBILITY_CLASS_FALLBACK_LABEL_KEY
    : LABEL_KEYS[visibilityClass];
  const descriptionKey = isUnknown
    ? VISIBILITY_CLASS_FALLBACK_DESCRIPTION_KEY
    : DESCRIPTION_KEYS[visibilityClass];

  // Solid colors so the badge stays legible on any photo background:
  //   shared (Общий)        → brand blue
  //   internal (Внутренний) → brand beige (secondary)
  //   unknown (legacy)      → muted outline
  const colorClasses =
    visibilityClass === "shared_project"
      ? "border-transparent bg-accent text-accent-foreground hover:bg-accent/90"
      : visibilityClass === "internal"
        ? "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
        : "text-muted-foreground";

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-normal cursor-help",
        colorClasses,
        className,
      )}
    >
      {t(labelKey)}
    </Badge>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            {badge}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-caption">
          {t(descriptionKey)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
