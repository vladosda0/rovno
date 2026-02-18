import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-sp-6 text-center", className)}>
      <div className="mb-sp-2 rounded-panel bg-muted p-sp-2">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-h3 text-foreground">{title}</h3>
      <p className="mb-sp-3 max-w-sm text-body-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
