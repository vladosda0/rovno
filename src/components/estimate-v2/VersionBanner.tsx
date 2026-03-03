import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VersionBannerProps {
  hasPending: boolean;
  isOpenByDefault?: boolean;
  title: string;
  hint?: string;
  primaryCta?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  children?: React.ReactNode;
}

export function VersionBanner({
  hasPending,
  isOpenByDefault = false,
  title,
  hint,
  primaryCta,
  secondaryActions,
  children,
}: VersionBannerProps) {
  const [open, setOpen] = useState(isOpenByDefault);

  useEffect(() => {
    setOpen(isOpenByDefault);
  }, [isOpenByDefault, hasPending]);

  if (!hasPending) return null;

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-body-sm font-medium text-foreground">{title}</div>
          {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((prev) => !prev)}>
            {open ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
            Review changes
          </Button>
          {secondaryActions}
          {primaryCta}
        </div>
      </div>

      {open ? (
        <div className="rounded-md border border-border bg-background p-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
