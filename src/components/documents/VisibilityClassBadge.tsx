import type { DocMediaVisibilityClass } from "@/types/entities";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABELS: Record<DocMediaVisibilityClass, string> = {
  shared_project: "Shared",
  internal: "Internal",
};

/**
 * Fallback copy when `visibility_class` is missing (e.g. legacy mock rows).
 * DB defaults unclassified rows to shared_project; we do not imply a finer ACL model.
 */
export const VISIBILITY_CLASS_FALLBACK_LABEL = "Visibility unknown (treated as shared)";

export function VisibilityClassBadge({
  visibilityClass,
  className,
}: {
  visibilityClass?: DocMediaVisibilityClass | null;
  className?: string;
}) {
  if (visibilityClass == null) {
    return (
      <Badge variant="outline" className={cn("shrink-0 font-normal text-muted-foreground", className)}>
        {VISIBILITY_CLASS_FALLBACK_LABEL}
      </Badge>
    );
  }

  return (
    <Badge
      variant={visibilityClass === "internal" ? "secondary" : "outline"}
      className={cn("shrink-0 font-normal", className)}
    >
      {LABELS[visibilityClass]}
    </Badge>
  );
}
