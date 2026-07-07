import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Circle,
  FolderTree,
  HardHat,
  Hammer,
  Home,
  Layers,
  Package,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useCanonicalSearch,
  type CanonicalSearchKind,
  type CanonicalSuggestion,
} from "@/hooks/use-canonical-search";
import { usePersonalResourceSuggestions } from "@/hooks/use-personal-resource-suggestions";
import { formatCentsAsRub } from "@/lib/user-catalog/validation";

const BADGE_ICON: Record<string, LucideIcon> = {
  stage: Layers,
  work: Hammer,
  subcategory: FolderTree,
  material: Package,
  tool: Wrench,
  labor: HardHat,
  subcontractor: Building2,
  overhead: Truck,
  other: Circle,
};

interface LibraryNameInputProps {
  value: string;
  kind: CanonicalSearchKind;
  /** Commit free text (rename). */
  onCommit: (next: string) => void;
  /**
   * Called when a suggestion is chosen to APPLY it. For resources this fills the
   * current line (title + library link). When omitted, choosing a suggestion
   * just commits its name.
   */
  onApplySuggestion?: (suggestion: CanonicalSuggestion) => void;
  /**
   * Gate the canonical-library typeahead. When false (e.g. demo/local workspace
   * mode, which has no Supabase session), the dropdown stays closed and no
   * search_canonical_library RPC is issued. Defaults to true.
   */
  searchEnabled?: boolean;
  /**
   * Merge the user's personal catalog items into the suggestions (above the
   * canonical results, home icon, price shown). Only meaningful for
   * kind="resource" in supabase mode. Defaults to false.
   */
  personalEnabled?: boolean;
  readOnly?: boolean;
  startInEditMode?: boolean;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  placeholder?: string;
}

/**
 * Inline-editable name field with a canonical-library typeahead. Mirrors
 * InlineEditableText's display<->edit/commit behavior and adds a live
 * suggestions dropdown (search_canonical_library) while typing.
 */
export function LibraryNameInput({
  value,
  kind,
  onCommit,
  onApplySuggestion,
  searchEnabled = true,
  personalEnabled = false,
  readOnly = false,
  startInEditMode = false,
  className,
  displayClassName,
  inputClassName,
  placeholder,
}: LibraryNameInputProps) {
  const { t } = useTranslation();
  const canEdit = !readOnly;
  const [isEditing, setIsEditing] = useState(startInEditMode && canEdit);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurRef = useRef(false);

  const debounced = useDebounce(draft, 200);
  const dropdownOpen = isEditing && draft.trim().length > 0 && searchEnabled;
  const search = useCanonicalSearch(debounced, kind, dropdownOpen);
  const personalSuggestions = usePersonalResourceSuggestions(
    debounced,
    dropdownOpen && personalEnabled && kind === "resource",
  );
  // True while the debounce gap hasn't caught up to the latest keystroke OR the
  // query is in flight — prevents the "no matches" empty state from flashing mid-type.
  const searchPending = search.isLoading || debounced.trim() !== draft.trim();
  // Personal items rank above canonical (spec R-8: "юзер обычно ищет свои").
  const suggestions = [...personalSuggestions, ...(search.data ?? [])];

  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [isEditing, value]);

  useEffect(() => {
    if (startInEditMode && canEdit) setIsEditing(true);
  }, [startInEditMode, canEdit]);

  useEffect(() => {
    if (!isEditing) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isEditing]);

  const commit = (finalValue?: string) => {
    setIsEditing(false);
    const next = finalValue ?? draft;
    if (next !== value) onCommit(next);
  };

  const cancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const pick = (suggestion: CanonicalSuggestion) => {
    // Any choice closes the dropdown and applies — clicking a suggestion should
    // never re-open the list.
    skipBlurRef.current = false;
    setIsEditing(false);
    setDraft(suggestion.name);
    if (suggestion.kind === "subcategory") {
      // Subcategories are groupings, not catalog articles: apply the label as free
      // text (no library link) rather than refining. Full catalog drill-down lands
      // with the Phase 4 Каталоги tab.
      if (suggestion.name !== value) onCommit(suggestion.name);
      return;
    }
    if (onApplySuggestion) onApplySuggestion(suggestion);
    else if (suggestion.name !== value) onCommit(suggestion.name);
  };

  if (!canEdit) {
    return (
      <div className={cn("min-h-7 px-1 py-0.5", className, displayClassName)}>
        {value || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
      </div>
    );
  }

  if (!isEditing) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={cn(
            "flex min-h-7 w-full items-center rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
            displayClassName,
          )}
        >
          {value || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
        </button>
      </div>
    );
  }

  return (
    <Popover open={dropdownOpen}>
      <PopoverAnchor asChild>
        <div className={className}>
          <Input
            ref={inputRef}
            value={draft}
            placeholder={placeholder}
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
              } else if (event.key === "Escape") {
                event.preventDefault();
                skipBlurRef.current = true;
                cancel();
              }
            }}
            className={cn(
              "h-7 border-transparent bg-transparent px-1 py-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
              inputClassName,
            )}
          />
        </div>
      </PopoverAnchor>

      {dropdownOpen && (
        <PopoverContent
          align="start"
          sideOffset={6}
          // Don't steal focus from the input — keep typing alive while the list is open.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Keep input focus when interacting with the dropdown so onBlur doesn't
          // commit the raw draft out from under a suggestion click.
          onMouseDown={() => {
            skipBlurRef.current = true;
          }}
          role="listbox"
          // Portaled out of the table so the table's overflow can't clip it; matches
          // the cell width, shows ~5 rows, and scrolls (flips above near the bottom).
          className="max-h-72 w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-y-auto p-1"
        >
          {searchPending ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("estimate.search.loading")}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("estimate.search.empty")}
            </div>
          ) : (
            suggestions.map((suggestion) => {
              // Personal items get the home icon regardless of resource type
              // (spec R-8: the icon marks the SOURCE, only in the dropdown).
              const Icon = suggestion.isPersonal
                ? Home
                : BADGE_ICON[suggestion.badgeType] ?? Circle;
              const secondary = suggestion.isPersonal
                ? [
                    suggestion.unit,
                    suggestion.priceCents != null
                      ? `${formatCentsAsRub(suggestion.priceCents)} ₽`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : suggestion.kind === "work"
                  ? suggestion.workStageName
                  : suggestion.kind === "subcategory"
                    ? t("estimate.search.badge.subcategory")
                    : suggestion.subcategory ?? suggestion.unit;
              return (
                <button
                  key={`${suggestion.kind}:${suggestion.id}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    pick(suggestion);
                  }}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      suggestion.isPersonal ? "text-accent" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words leading-snug">{suggestion.name}</span>
                    {secondary && (
                      <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
