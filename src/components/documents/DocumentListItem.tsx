import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentListItemProps {
  title: string;
  details?: ReactNode;
  trailing?: ReactNode;
  titleAdornment?: ReactNode;
  onOpen?: () => void;
  className?: string;
  muted?: boolean;
}

export function DocumentListItem({
  title,
  details,
  trailing,
  titleAdornment,
  onOpen,
  className,
  muted = false,
}: DocumentListItemProps) {
  const titleClassName = cn(
    "min-w-0 text-body-sm font-medium truncate flex items-center gap-x-2",
    muted ? "text-muted-foreground" : "text-foreground",
    onOpen ? "hover:text-accent transition-colors" : "",
  );

  return (
    <div className={cn("flex items-center gap-3 px-sp-3 py-3", onOpen ? "hover:bg-muted/30 transition-colors" : "", className)}>
      <FileText className={cn("h-5 w-5 shrink-0", muted ? "text-muted-foreground/70" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} className={cn(titleClassName, "text-left w-full")}>
            {titleAdornment}
            <span className="truncate">{title}</span>
          </button>
        ) : (
          <div className={titleClassName}>
            {titleAdornment}
            <span className="truncate">{title}</span>
          </div>
        )}
        {details ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {details}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <div className="shrink-0">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
