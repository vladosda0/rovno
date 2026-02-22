import { cn } from "@/lib/utils";

type StatusVariant = "task" | "estimate" | "procurement";

interface StatusBadgeProps {
  status: string;
  variant: StatusVariant;
  className?: string;
}

const statusStyles: Record<StatusVariant, Record<string, string>> = {
  task: {
    "Not started": "bg-muted text-muted-foreground",
    "In progress": "bg-info/15 text-info",
    "Done": "bg-success/15 text-success",
    "Blocked": "bg-destructive/15 text-destructive",
  },
  estimate: {
    "Draft": "bg-muted text-muted-foreground",
    "Approved": "bg-success/15 text-success",
    "Archived": "border border-border text-muted-foreground bg-transparent",
  },
  procurement: {
    "To buy": "bg-warning/15 text-warning-foreground",
    "Ordered": "bg-info/15 text-info",
    "In stock": "bg-success/15 text-success",
    "Not purchased": "bg-muted text-muted-foreground",
    "Purchased": "bg-success/15 text-success",
  },
};

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  const style = statusStyles[variant]?.[status] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption font-medium",
        style,
        className,
      )}
    >
      {status}
    </span>
  );
}
