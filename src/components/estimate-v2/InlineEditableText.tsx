import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InlineEditableTextProps {
  value: string;
  onCommit: (nextValue: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  formatDisplay?: (value: string) => string;
  startInEditMode?: boolean;
}

export function InlineEditableText({
  value,
  onCommit,
  disabled = false,
  readOnly = false,
  placeholder = "—",
  className,
  displayClassName,
  inputClassName,
  formatDisplay,
  startInEditMode = false,
}: InlineEditableTextProps) {
  const canEdit = !disabled && !readOnly;
  const [isEditing, setIsEditing] = useState(startInEditMode && canEdit);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [isEditing, value]);

  useEffect(() => {
    if (!startInEditMode || !canEdit) return;
    setIsEditing(true);
  }, [canEdit, startInEditMode]);

  useEffect(() => {
    if (!isEditing) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isEditing]);

  const commit = () => {
    setIsEditing(false);
    if (draft !== value) onCommit(draft);
  };

  const cancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  if (!canEdit) {
    const rendered = formatDisplay ? formatDisplay(value) : value;
    return (
      <div className={cn("min-h-7 px-1 py-0.5 text-sm text-foreground", className, displayClassName)}>
        {rendered || <span className="text-muted-foreground">{placeholder}</span>}
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className={className}>
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              skipBlurRef.current = true;
              commit();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              skipBlurRef.current = true;
              cancel();
            }
          }}
          className={cn(
            "h-7 border-transparent bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
            inputClassName,
          )}
        />
      </div>
    );
  }

  const rendered = formatDisplay ? formatDisplay(value) : value;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={cn(
          "flex min-h-7 w-full items-center rounded-sm px-1 py-0.5 text-left text-sm text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
          displayClassName,
        )}
      >
        {rendered || <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    </div>
  );
}
