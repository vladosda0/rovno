import { useTranslation } from "react-i18next";
import type { DocMediaVisibilityClass } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABEL_KEYS: Record<DocMediaVisibilityClass, string> = {
  shared_project: "documents.visibility.shared",
  internal: "documents.visibility.internal",
};

/**
 * Fallback copy when `visibility_class` is missing (e.g. legacy mock rows).
 * DB defaults unclassified rows to shared_project; we do not imply a finer ACL model.
 */
export const VISIBILITY_CLASS_FALLBACK_LABEL_KEY = "documents.visibility.unknown";

export function VisibilityClassBadge({
  visibilityClass,
  className,
}: {
  visibilityClass?: DocMediaVisibilityClass | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (visibilityClass == null) {
    return (
      <Badge variant="outline" className={cn("shrink-0 font-normal text-muted-foreground", className)}>
        {t(VISIBILITY_CLASS_FALLBACK_LABEL_KEY)}
      </Badge>
    );
  }

  return (
    <Badge
      variant={visibilityClass === "internal" ? "secondary" : "outline"}
      className={cn("shrink-0 font-normal", className)}
    >
      {t(LABEL_KEYS[visibilityClass])}
    </Badge>
  );
}
