import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProjectWorkflowEmptyStateVariant = "procurement" | "hr" | "gallery" | "documents";

interface ProjectWorkflowEmptyStateProps {
  variant: ProjectWorkflowEmptyStateVariant;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

function Illustration({ variant }: { variant: ProjectWorkflowEmptyStateVariant }) {
  const accentClass = {
    procurement: "text-warning",
    hr: "text-info",
    gallery: "text-accent",
    documents: "text-success",
  }[variant];

  return (
    <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border border-border bg-muted/30">
      <svg viewBox="0 0 160 120" className={cn("h-20 w-24", accentClass)} role="img" aria-hidden="true">
        <rect x="10" y="18" width="140" height="90" rx="12" fill="currentColor" opacity="0.12" />
        <rect x="24" y="30" width="112" height="66" rx="8" fill="none" stroke="currentColor" strokeWidth="6" opacity="0.55" />
        <circle cx="52" cy="56" r="8" fill="currentColor" opacity="0.7" />
        <path d="M38 86 L70 66 L86 78 L108 58 L124 72" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function ProjectWorkflowEmptyState({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: ProjectWorkflowEmptyStateProps) {
  return (
    <div className={cn("rounded-card border border-border bg-card p-sp-4 text-center", className)}>
      <div className="mx-auto max-w-xl space-y-3">
        <Illustration variant={variant} />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction && (
          <Button type="button" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
