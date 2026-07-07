import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useCanonicalSearch } from "@/hooks/use-canonical-search";

export interface MatchedArticle {
  id: string;
  name: string;
  rovnoSku: string | null;
}

interface ArticleMatchComboboxProps {
  /** Current link (null = un-linked). */
  matchedArticleId: string | null;
  matchedArticleName: string | null;
  /** Seed query when opening the picker — usually the row name. */
  seedQuery: string;
  onSelect: (article: MatchedArticle | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * "Артикул Rovno" dropdown (spec R-5/US-7): optional manual link from a user
 * catalog item to a canonical library leaf. Suggestions come from the same
 * search_canonical_library RPC as the estimate autocomplete, filtered to leaf
 * resources (subcategories are groupings, not linkable articles).
 */
export function ArticleMatchCombobox({
  matchedArticleId,
  matchedArticleName,
  seedQuery,
  onSelect,
  disabled = false,
  className,
}: ArticleMatchComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery(seedQuery);
    // Reseed only on open — while the picker is open the user owns the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const debounced = useDebounce(query, 200);
  const search = useCanonicalSearch(debounced, "resource", open);
  const suggestions = (search.data ?? []).filter((s) => s.kind === "resource");
  const pending = search.isLoading || debounced.trim() !== query.trim();

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-7 w-full justify-between gap-1 px-2 text-xs font-normal",
            !matchedArticleId && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1">
            {matchedArticleId && <Link2 className="h-3 w-3 shrink-0 text-accent" />}
            <span className="truncate">
              {matchedArticleId
                ? matchedArticleName ?? t("catalogEditor.match.linked")
                : t("catalogEditor.match.placeholder")}
            </span>
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("catalogEditor.match.searchPlaceholder")}
          className="mb-2 h-8"
          autoFocus
        />
        <div className="max-h-56 overflow-y-auto">
          {matchedArticleId && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {t("catalogEditor.match.clear")}
            </button>
          )}
          {pending ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t("estimate.search.loading")}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t("estimate.search.empty")}
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => {
                  onSelect({
                    id: suggestion.id,
                    name: suggestion.name,
                    rovnoSku: suggestion.rovnoSku,
                  });
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Check
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    suggestion.id === matchedArticleId ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words leading-snug">{suggestion.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[suggestion.rovnoSku, suggestion.subcategory].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
