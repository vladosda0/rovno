import type { KeyboardEvent, ReactNode } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentGridCardProps {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  titleAdornment?: ReactNode;
  onOpen?: () => void;
  className?: string;
  muted?: boolean;
}

export function DocumentGridCard({
  title,
  meta,
  actions,
  titleAdornment,
  onOpen,
  className,
  muted = false,
}: DocumentGridCardProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onOpen) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "glass group flex min-h-[172px] flex-col gap-4 rounded-card p-4 text-left transition-all sm:p-5",
        onOpen ? "cursor-pointer hover:bg-muted/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : "",
        muted ? "opacity-70" : "",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("rounded-panel bg-muted/50 p-2", muted ? "text-muted-foreground/70" : "text-muted-foreground")}>
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className={cn("text-body-sm font-medium leading-6", muted ? "text-muted-foreground" : "text-foreground")}>
              {titleAdornment}
              <span className="break-words">{title}</span>
            </div>
          </div>
        </div>
        {actions ? (
          <div
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
