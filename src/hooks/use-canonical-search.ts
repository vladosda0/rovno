import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { trackEventOncePerSession } from "@/lib/analytics";

const rawSupabase = supabase as unknown as SupabaseClient;

export type CanonicalSearchKind = "stage" | "work" | "resource";
export type CanonicalSuggestionKind = "stage" | "work" | "resource" | "subcategory";

export interface CanonicalSuggestion {
  id: string;
  kind: CanonicalSuggestionKind;
  name: string;
  /** 'stage' | 'work' | 'subcategory' | a resource_type (material/tool/...) */
  badgeType: string;
  source: string;
  isPersonal: boolean;
  /** rovno.ai template_stage_id / template_work_id for apply (null for resources). */
  templateId: string | null;
  /** Parent stage name, for work suggestions. */
  workStageName: string | null;
  subcategory: string | null;
  unit: string | null;
  rovnoSku: string | null;
  /** Personal catalog suggestions only: the user's own price for the item. */
  priceCents?: number | null;
  /** Personal catalog suggestions only: canonical article the item is matched to. */
  matchedArticleId?: string | null;
}

interface RawSuggestion {
  id: string;
  kind: string;
  name: string;
  badge_type: string;
  source: string;
  is_personal: boolean;
  template_id: string | null;
  work_stage_name: string | null;
  subcategory: string | null;
  unit: string | null;
  rovno_sku: string | null;
}

const SUGGESTION_KINDS = new Set<CanonicalSuggestionKind>(["stage", "work", "resource", "subcategory"]);

/** search_canonical_library: live autocomplete suggestions for stage/work/resource name inputs. */
export function useCanonicalSearch(query: string, kind: CanonicalSearchKind, enabled: boolean) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search_canonical_library", kind, trimmed],
    enabled: enabled && trimmed.length > 0,
    queryFn: async (): Promise<CanonicalSuggestion[]> => {
      const { data, error } = await rawSupabase.rpc("search_canonical_library", {
        p_query: trimmed,
        p_kind: kind,
      });
      if (error) throw error;
      // Funnel step (once per session — this fires per keystroke otherwise).
      trackEventOncePerSession("library_searched", { kind });
      const rows = (data ?? []) as RawSuggestion[];
      return rows.map((r) => ({
        id: r.id,
        kind: SUGGESTION_KINDS.has(r.kind as CanonicalSuggestionKind)
          ? (r.kind as CanonicalSuggestionKind)
          : "resource",
        name: r.name,
        badgeType: r.badge_type,
        source: r.source,
        isPersonal: Boolean(r.is_personal),
        templateId: r.template_id,
        workStageName: r.work_stage_name,
        subcategory: r.subcategory,
        unit: r.unit,
        rovnoSku: r.rovno_sku,
      }));
    },
    staleTime: 30 * 1000,
  });
}
