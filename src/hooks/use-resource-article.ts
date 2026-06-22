import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const rawSupabase = supabase as unknown as SupabaseClient;

export interface ResourceArticle {
  id: string;
  name: string;
  canonicalName: string | null;
  categoryPath: string;
  subcategory: string | null;
  kind: string;
  unitDisplay: string;
  unitOriginal: string;
  conversionFactor: number;
  okpd2Code: string | null;
  rovnoSku: string;
  defaultResourceType: string;
  source: string;
  isResidentialCurated: boolean;
}

export interface ResourceArticleSibling {
  id: string;
  name: string;
  defaultResourceType: string;
  unitDisplay: string;
  rovnoSku: string;
  subcategory: string | null;
}

export interface ResourceArticleDetail {
  article: ResourceArticle;
  siblings: ResourceArticleSibling[];
}

interface RawArticle {
  id: string;
  name: string;
  canonical_name: string | null;
  category_path: string;
  subcategory: string | null;
  kind: string;
  unit_display: string;
  unit_original: string;
  conversion_factor: number;
  okpd2_code: string | null;
  rovno_sku: string;
  default_resource_type: string;
  source: string;
  is_residential_curated: boolean;
}

interface RawSibling {
  id: string;
  name: string;
  default_resource_type: string;
  unit_display: string;
  rovno_sku: string;
  subcategory: string | null;
}

interface RawDetail {
  article: RawArticle | null;
  siblings: RawSibling[] | null;
}

/** get_resource_article_detail: article fields + curated subcategory siblings. */
export function useResourceArticleDetail(articleId: string | null | undefined) {
  return useQuery({
    queryKey: ["resource_article", "detail", articleId ?? null],
    enabled: Boolean(articleId),
    queryFn: async (): Promise<ResourceArticleDetail | null> => {
      if (!articleId) return null;
      const { data, error } = await rawSupabase.rpc("get_resource_article_detail", {
        p_article_id: articleId,
      });
      if (error) throw error;
      if (!data) return null;
      const raw = data as RawDetail;
      if (!raw.article) return null;
      const a = raw.article;
      return {
        article: {
          id: a.id,
          name: a.name,
          canonicalName: a.canonical_name,
          categoryPath: a.category_path,
          subcategory: a.subcategory,
          kind: a.kind,
          unitDisplay: a.unit_display,
          unitOriginal: a.unit_original,
          conversionFactor: a.conversion_factor,
          okpd2Code: a.okpd2_code,
          rovnoSku: a.rovno_sku,
          defaultResourceType: a.default_resource_type,
          source: a.source,
          isResidentialCurated: a.is_residential_curated,
        },
        siblings: (raw.siblings ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          defaultResourceType: s.default_resource_type,
          unitDisplay: s.unit_display,
          rovnoSku: s.rovno_sku,
          subcategory: s.subcategory,
        })),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface ResourceArticlePriceComparison {
  articleId: string;
  sampleCount: number;
  projectCount: number;
  medianCents: number | null;
  avgCents: number | null;
  minCents: number | null;
  maxCents: number | null;
}

interface RawComparison {
  article_id: string;
  sample_count: number;
  project_count: number;
  median_cents: number | null;
  avg_cents: number | null;
  min_cents: number | null;
  max_cents: number | null;
}

/**
 * get_resource_article_price_comparison: cross-project median/avg/min/max for an
 * article, across projects the caller can access. Pass the current projectId as
 * excludeProjectId to compare against *other* projects only.
 */
export function useResourceArticlePriceComparison(
  articleId: string | null | undefined,
  excludeProjectId?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["resource_article", "price_comparison", articleId ?? null, excludeProjectId ?? null],
    enabled: Boolean(articleId) && (options?.enabled ?? true),
    queryFn: async (): Promise<ResourceArticlePriceComparison | null> => {
      if (!articleId) return null;
      const { data, error } = await rawSupabase.rpc("get_resource_article_price_comparison", {
        p_article_id: articleId,
        p_exclude_project_id: excludeProjectId ?? null,
      });
      if (error) throw error;
      if (!data) return null;
      const r = data as RawComparison;
      return {
        articleId: r.article_id,
        sampleCount: r.sample_count ?? 0,
        projectCount: r.project_count ?? 0,
        medianCents: r.median_cents,
        avgCents: r.avg_cents,
        minCents: r.min_cents,
        maxCents: r.max_cents,
      };
    },
    staleTime: 60 * 1000,
  });
}
