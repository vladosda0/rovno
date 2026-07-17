import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  /** Current numeric quantity (owned by the parent). */
  value: number;
  onChange: (value: number) => void;
  /** Floor for the − button and for coercing invalid input. Defaults to 1. */
  min?: number;
  disabled?: boolean;
  ariaLabel?: string;
  /**
   * Unit rendered inside the control, right after the number (e.g. "шт", "м³"),
   * so it's immediately clear what the quantity measures.
   */
  unitLabel?: string | null;
  className?: string;
}

/** Render a number the way a user typed it: no trailing ".0", decimals kept. */
function formatQty(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

/**
 * Coerce free-typed text (allowing a decimal comma) to a positive quantity,
 * flooring at `min`. Empty / NaN / <= 0 all fall back to `min`.
 */
export function parseQty(raw: string, min: number): number {
  const parsed = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return min;
  return Math.max(min, parsed);
}

/**
 * Compact − / input / + control for choosing "how many" before an add action.
 * The parent owns the numeric value; the text field keeps a local buffer so the
 * user can type freely (empty, "2.") and it commits on blur / Enter.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  disabled = false,
  ariaLabel,
  unitLabel,
  className,
}: QuantityStepperProps) {
  const [buffer, setBuffer] = useState(() => formatQty(value));

  // Resync the editable buffer whenever the committed value changes from the
  // outside (stepper buttons, external reset).
  useEffect(() => {
    setBuffer(formatQty(value));
  }, [value]);

  const commit = (raw: string) => {
    const next = parseQty(raw, min);
    setBuffer(formatQty(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className={cn("flex items-center rounded-md border border-input", className)}>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
        aria-label={ariaLabel ? `${ariaLabel} −` : "Decrease quantity"}
        tabIndex={-1}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        value={buffer}
        disabled={disabled}
        onChange={(event) => setBuffer(event.target.value)}
        onBlur={() => commit(buffer)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(buffer);
          }
        }}
        inputMode="decimal"
        aria-label={ariaLabel ?? "Quantity"}
        className={cn(
          "h-7 w-9 border-l border-input bg-transparent text-center text-xs tabular-nums outline-none focus:bg-accent/40 disabled:opacity-40",
          !unitLabel && "border-r",
        )}
      />
      {unitLabel && (
        <span className="flex h-7 items-center whitespace-nowrap border-x border-input px-1.5 text-xs font-medium text-foreground">
          {unitLabel}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
        aria-label={ariaLabel ? `${ariaLabel} +` : "Increase quantity"}
        tabIndex={-1}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
