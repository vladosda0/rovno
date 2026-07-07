import { useMemo } from "react";

import { useAllUserCatalogItems } from "@/hooks/use-user-catalogs";
import type { CanonicalSuggestion } from "@/hooks/use-canonical-search";

const MAX_PERSONAL_SUGGESTIONS = 5;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Personal-catalog suggestions for the estimate resource-name autocomplete
 * (spec R-8). The user's items are one cached query (useAllUserCatalogItems);
 * matching is client-side — exact > prefix > substring — and the result is
 * shaped as CanonicalSuggestion with isPersonal=true so LibraryNameInput can
 * merge them above the canonical RPC results.
 */
export function usePersonalResourceSuggestions(
  query: string,
  enabled: boolean,
): CanonicalSuggestion[] {
  const itemsQuery = useAllUserCatalogItems(enabled);

  return useMemo(() => {
    if (!enabled) return [];
    const term = normalize(query);
    if (!term) return [];
    const items = itemsQuery.data ?? [];

    const ranked: Array<{ rank: number; suggestion: CanonicalSuggestion }> = [];
    for (const item of items) {
      const name = normalize(item.name);
      let rank = 0;
      if (name === term) rank = 3;
      else if (name.startsWith(term)) rank = 2;
      else if (name.includes(term)) rank = 1;
      if (rank === 0) continue;
      ranked.push({
        rank,
        suggestion: {
          id: item.id,
          kind: "resource",
          name: item.name,
          badgeType: item.resourceType,
          source: "user_catalog",
          isPersonal: true,
          templateId: null,
          workStageName: null,
          subcategory: null,
          unit: item.unit || null,
          rovnoSku: item.supplierSku,
          priceCents: item.priceCents,
          matchedArticleId: item.matchedArticleId,
        },
      });
    }

    ranked.sort(
      (a, b) => b.rank - a.rank || a.suggestion.name.localeCompare(b.suggestion.name, "ru"),
    );
    return ranked.slice(0, MAX_PERSONAL_SUGGESTIONS).map((entry) => entry.suggestion);
  }, [enabled, query, itemsQuery.data]);
}
