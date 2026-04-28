import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InlineEditableNumberProps {
  value: number;
  onCommit: (nextValue: number) => void;
  parseInput?: (raw: string) => number | null;
  formatDisplay?: (value: number) => string;
  formatInput?: (value: number) => string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  startInEditMode?: boolean;
  /** Horizontal alignment of the rendered value. Defaults to "right". */
  align?: "left" | "right";
}

export function InlineEditableNumber({
  value,
  onCommit,
  parseInput,
  formatDisplay,
  formatInput,
  disabled = false,
  readOnly = false,
  placeholder = "—",
  className,
  displayClassName,
  inputClassName,
  startInEditMode = false,
  align = "right",
}: InlineEditableNumberProps) {
  const canEdit = !disabled && !readOnly;
  const isLeft = align === "left";
  const alignText = isLeft ? "text-left" : "text-right";
  const alignFlex = isLeft ? "justify-start" : "justify-end";
  const toInput = useMemo(
    () => formatInput ?? ((current: number) => String(current)),
    [formatInput],
  );
  const toDisplay = useMemo(
    () => formatDisplay ?? ((current: number) => String(current)),
    [formatDisplay],
  );
  const parse = useMemo(
    () => parseInput ?? ((raw: string) => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    }),
    [parseInput],
  );

  const [isEditing, setIsEditing] = useState(startInEditMode && canEdit);
  const [draft, setDraft] = useState(toInput(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraft(toInput(value));
  }, [isEditing, toInput, value]);

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
    const parsed = parse(draft);
    setIsEditing(false);
    if (parsed == null) return;
    if (parsed !== value) onCommit(parsed);
  };

  const cancel = () => {
    setDraft(toInput(value));
    setIsEditing(false);
  };

  if (!canEdit) {
    const rendered = toDisplay(value);
    return (
      <div className={cn("min-h-7 whitespace-nowrap px-1 py-0.5 text-sm tabular-nums text-foreground", alignText, className, displayClassName)}>
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
          inputMode="decimal"
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
            "h-7 border-transparent bg-transparent px-1 py-0 text-sm tabular-nums shadow-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
            alignText,
            inputClassName,
          )}
        />
      </div>
    );
  }

  const rendered = toDisplay(value);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={cn(
          "flex min-h-7 whitespace-nowrap w-full items-center rounded-sm px-1 py-0.5 text-sm tabular-nums text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
          alignText,
          alignFlex,
          displayClassName,
        )}
      >
        {rendered || <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    </div>
  );
}
