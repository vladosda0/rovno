import { Building2, Circle, HardHat, Package, Truck, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resourceLineSemanticLabel } from "@/lib/estimate-v2/resource-type-contract";
import type { ResourceLineType } from "@/types/estimate-v2";

export type OtherResourcePresentation = "generic" | "overhead";

interface ResourceTypeBadgeProps {
  type: ResourceLineType;
  className?: string;
  labelOverride?: string;
  iconOnly?: boolean;
  /** When `type` is `other`, distinguishes delivery/overhead-style lines (truck) from generic “other” (circle). */
  otherPresentation?: OtherResourcePresentation;
}

const OTHER_BADGE_CLASS = "bg-muted text-muted-foreground border-border";

const typeMeta: Record<ResourceLineType, { className: string; Icon: typeof Package }> = {
  material: {
    className: "bg-sky-100 text-sky-700 border-sky-200",
    Icon: Package,
  },
  tool: {
    className: "bg-violet-100 text-violet-700 border-violet-200",
    Icon: Wrench,
  },
  labor: {
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Icon: HardHat,
  },
  subcontractor: {
    className: "bg-amber-100 text-amber-700 border-amber-200",
    Icon: Building2,
  },
  other: {
    className: OTHER_BADGE_CLASS,
    Icon: Circle,
  },
};

const otherPresentationMeta: Record<OtherResourcePresentation, { className: string; Icon: typeof Circle }> = {
  generic: { className: OTHER_BADGE_CLASS, Icon: Circle },
  overhead: { className: OTHER_BADGE_CLASS, Icon: Truck },
};

export function ResourceTypeBadge({
  type,
  className,
  labelOverride,
  iconOnly = false,
  otherPresentation = "generic",
}: ResourceTypeBadgeProps) {
  const { t } = useTranslation();
  const meta = type === "other" ? otherPresentationMeta[otherPresentation] : typeMeta[type];
  const Icon = meta.Icon;
  const label = labelOverride ?? t(resourceLineSemanticLabel(type));

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
        iconOnly && "w-6 justify-center px-0",
        meta.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {!iconOnly && <span>{label}</span>}
      {iconOnly && <span className="sr-only">{label}</span>}
    </Badge>
  );
}
