import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LOOKUP_MIN_QUERY, type LookupOutcome } from "@/data/requisites-lookup-source";

export const SUGGEST_DEBOUNCE_MS = 300;

export interface SuggestItemView {
  key: string;
  primary: string;
  secondary?: string;
  badge?: string;
}

interface RequisitesSuggestInputProps<T> {
  id: string;
  value: string;
  onChange: (value: string) => void;
  search: (query: string) => Promise<LookupOutcome<T[]>>;
  view: (item: T) => SuggestItemView;
  onPick: (item: T) => void;
  listHint?: string;
  notFoundText: string;
  unavailableText: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  inputClassName?: string;
  inputMode?: "numeric" | "text";
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
  /** Keys the open list did not consume (Enter or Escape with no list shown). */
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  children?: ReactNode;
}

type State<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "results"; items: T[] }
  | { phase: "empty" }
  | { phase: "unavailable" };

/**
 * Text field with a suggestion list under it (rovno#226, frame 1 variant A):
 * the person types three or more characters, picks a line, the caller fills the
 * rest. Only the person's own typing searches; values set by a pick do not.
 */
export function RequisitesSuggestInput<T>({
  id,
  value,
  onChange,
  search,
  view,
  onPick,
  listHint,
  notFoundText,
  unavailableText,
  disabled,
  readOnly,
  className,
  inputClassName,
  inputMode,
  placeholder,
  maxLength,
  autoFocus,
  ariaLabel,
  onInputKeyDown,
  onBlur,
  children,
}: RequisitesSuggestInputProps<T>) {
  const listId = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const [state, setState] = useState<State<T>>({ phase: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Results shown for an earlier query until the new search answers; Enter
  // must not pick from them.
  const [stale, setStale] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (typed === null) return;
    const query = typed.trim();
    if (query.length < LOOKUP_MIN_QUERY) {
      requestSeq.current += 1;
      setState({ phase: "idle" });
      return;
    }
    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      setState({ phase: "loading" });
      void search(query).then((outcome) => {
        if (seq !== requestSeq.current) return;
        if (outcome.status === "unavailable") setState({ phase: "unavailable" });
        else if (outcome.value.length === 0) setState({ phase: "empty" });
        else {
          setActive(0);
          setState({ phase: "results", items: outcome.value });
        }
        setStale(false);
      });
    }, SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, search]);

  const pick = (item: T) => {
    requestSeq.current += 1;
    setTyped(null);
    setStale(false);
    setOpen(false);
    setState({ phase: "idle" });
    onPick(item);
  };

  const items = state.phase === "results" ? state.items : [];
  const showList = open && items.length > 0;

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          inputMode={inputMode}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          className={inputClassName}
          onChange={(event) => {
            onChange(event.target.value);
            setTyped(event.target.value);
            setStale(true);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
          onKeyDown={(event) => {
            if (!showList || (stale && (event.key === "ArrowDown" || event.key === "ArrowUp"))) {
              onInputKeyDown?.(event);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (event.key === "Enter") {
              if (stale) {
                onInputKeyDown?.(event);
                return;
              }
              event.preventDefault();
              pick(items[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
              onInputKeyDown?.(event);
            } else {
              onInputKeyDown?.(event);
            }
          }}
        />
        {state.phase === "loading" ? (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {showList ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {items.map((item, index) => {
              const itemView = view(item);
              return (
                <li
                  key={itemView.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "cursor-pointer px-3 py-1.5 text-sm",
                    index === active ? "bg-accent/10" : "hover:bg-muted",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(item);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <div className="font-medium text-foreground">
                    {itemView.primary}
                    {itemView.badge ? (
                      <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-caption font-normal text-destructive">
                        {itemView.badge}
                      </span>
                    ) : null}
                  </div>
                  {itemView.secondary ? (
                    <div className="text-caption text-muted-foreground">{itemView.secondary}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {listHint ? (
            <div className="border-t border-border px-3 py-1.5 text-caption text-muted-foreground">{listHint}</div>
          ) : null}
        </div>
      ) : null}
      {state.phase === "empty" ? <p className="mt-1 text-caption text-muted-foreground">{notFoundText}</p> : null}
      {state.phase === "unavailable" ? <p className="mt-1 text-caption text-warning">{unavailableText}</p> : null}
      {children}
    </div>
  );
}
