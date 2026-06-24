import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const rawSupabase = supabase as unknown as SupabaseClient;

export interface CatalogSubcategory {
  subcategory: string;
  leafCount: number;
}

export interface CatalogGroup {
  group: string;
  subcategories: CatalogSubcategory[];
}

export interface CatalogResource {
  id: string;
  name: string;
  defaultResourceType: string;
  unitDisplay: string | null;
  rovnoSku: string;
  subcategory: string | null;
}

export type CanonicalCatalog =
  | { mode: "tree"; groups: CatalogGroup[] }
  | { mode: "drill"; subcategory: string; resources: CatalogResource[] };

interface RawTreeSubcat {
  subcategory: string;
  leaf_count: number;
}
interface RawTreeGroup {
  group: string;
  subcategories: RawTreeSubcat[] | null;
}
interface RawTree {
  groups: RawTreeGroup[] | null;
}
interface RawDrillResource {
  id: string;
  name: string;
  default_resource_type: string;
  unit_display: string | null;
  rovno_sku: string;
  subcategory: string | null;
}
interface RawDrill {
  subcategory: string;
  resources: RawDrillResource[] | null;
}

/**
 * browse_canonical_catalog: the resource-library browse tree for the constructor's
 * Каталоги tab. `subcategory === null` returns the group -> subcategory tree (with leaf
 * counts); a subcategory returns the curated leaves in it. snake_case -> camelCase.
 */
export function useCanonicalCatalog(subcategory: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["canonical_catalog", subcategory ?? "__tree__"],
    enabled,
    queryFn: async (): Promise<CanonicalCatalog> => {
      const { data, error } = await rawSupabase.rpc("browse_canonical_catalog", {
        p_subcategory: subcategory,
      });
      if (error) throw error;

      if (subcategory == null) {
        const raw = (data ?? { groups: [] }) as RawTree;
        return {
          mode: "tree",
          groups: (raw.groups ?? []).map((group) => ({
            group: group.group,
            subcategories: (group.subcategories ?? []).map((sub) => ({
              subcategory: sub.subcategory,
              leafCount: sub.leaf_count ?? 0,
            })),
          })),
        };
      }

      const raw = (data ?? { subcategory, resources: [] }) as RawDrill;
      return {
        mode: "drill",
        subcategory: raw.subcategory ?? subcategory,
        resources: (raw.resources ?? []).map((resource) => ({
          id: resource.id,
          name: resource.name,
          defaultResourceType: resource.default_resource_type,
          unitDisplay: resource.unit_display,
          rovnoSku: resource.rovno_sku,
          subcategory: resource.subcategory,
        })),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
