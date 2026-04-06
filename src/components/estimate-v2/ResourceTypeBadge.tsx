import { Building2, Circle, HardHat, Package, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resourceLineSemanticLabel } from "@/lib/estimate-v2/resource-type-contract";
import type { ResourceLineType } from "@/types/estimate-v2";

interface ResourceTypeBadgeProps {
  type: ResourceLineType;
  className?: string;
  labelOverride?: string;
  iconOnly?: boolean;
}

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
    className: "bg-muted text-muted-foreground border-border",
    Icon: Circle,
  },
};

export function ResourceTypeBadge({ type, className, labelOverride, iconOnly = false }: ResourceTypeBadgeProps) {
  const meta = typeMeta[type];
  const Icon = meta.Icon;
  const label = labelOverride ?? resourceLineSemanticLabel(type);

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
