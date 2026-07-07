import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { ResourceLineType } from "@/types/estimate-v2";
import type {
  UserCatalog,
  UserCatalogItem,
  UserCatalogItemRow,
  UserCatalogRow,
} from "@/types/user-catalog";

// user_catalogs / user_catalog_items / create_user_catalog are not in the
// generated backend contract yet (the backend-truth sync PR lands after the
// rovno-db migration merges), so access goes through the untyped client —
// same pattern as the T-Bank RPC hooks.
const rawSupabase = supabase as unknown as SupabaseClient;

export const userCatalogKeys = {
  all: ["user-catalogs"] as const,
  list: () => [...userCatalogKeys.all, "list"] as const,
  items: (catalogId: string) => [...userCatalogKeys.all, "items", catalogId] as const,
  allItems: () => [...userCatalogKeys.all, "all-items"] as const,
};

const RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "material", "tool", "labor", "subcontractor", "overhead", "other",
]);

function normalizeCatalog(row: UserCatalogRow): UserCatalog {
  return {
    id: row.id,
    name: row.name,
    sourceFilename: row.source_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeItem(row: UserCatalogItemRow): UserCatalogItem {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    position: row.position,
    name: row.name,
    unit: row.unit,
    priceCents: row.price_cents,
    resourceType: RESOURCE_TYPES.has(row.resource_type)
      ? (row.resource_type as ResourceLineType)
      : "material",
    supplierSku: row.supplier_sku,
    matchedArticleId: row.matched_article_id,
  };
}

const ITEM_COLUMNS =
  "id, catalog_id, position, name, unit, price_cents, resource_type, supplier_sku, matched_article_id";

export function useUserCatalogs(enabled: boolean) {
  return useQuery({
    queryKey: userCatalogKeys.list(),
    enabled,
    queryFn: async (): Promise<UserCatalog[]> => {
      const { data, error } = await rawSupabase
        .from("user_catalogs")
        .select("id, name, source_filename, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as UserCatalogRow[]).map(normalizeCatalog);
    },
    staleTime: 30 * 1000,
  });
}

export function useUserCatalog(catalogId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...userCatalogKeys.list(), catalogId ?? "none"],
    enabled: enabled && Boolean(catalogId),
    queryFn: async (): Promise<UserCatalog | null> => {
      const { data, error } = await rawSupabase
        .from("user_catalogs")
        .select("id, name, source_filename, created_at, updated_at")
        .eq("id", catalogId)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeCatalog(data as UserCatalogRow) : null;
    },
  });
}

export function useUserCatalogItems(catalogId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: userCatalogKeys.items(catalogId ?? "none"),
    enabled: enabled && Boolean(catalogId),
    queryFn: async (): Promise<UserCatalogItem[]> => {
      const { data, error } = await rawSupabase
        .from("user_catalog_items")
        .select(ITEM_COLUMNS)
        .eq("catalog_id", catalogId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as UserCatalogItemRow[]).map(normalizeItem);
    },
  });
}

/**
 * Every item across the user's catalogs (RLS scopes to the owner). Shared by
 * the estimate autocomplete, the constructor "Мои каталоги" tab and the
 * catalogs list (per-catalog counts) — one cached query for all three.
 */
export function useAllUserCatalogItems(enabled: boolean) {
  return useQuery({
    queryKey: userCatalogKeys.allItems(),
    enabled,
    queryFn: async (): Promise<UserCatalogItem[]> => {
      const { data, error } = await rawSupabase
        .from("user_catalog_items")
        .select(ITEM_COLUMNS)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as UserCatalogItemRow[]).map(normalizeItem);
    },
    staleTime: 60 * 1000,
  });
}

export interface SaveCatalogItemInput {
  name: string;
  unit: string;
  priceCents: number;
  resourceType: ResourceLineType;
  supplierSku: string | null;
  matchedArticleId: string | null;
  position: number;
}

export interface SaveCatalogInput {
  name: string;
  sourceFilename: string | null;
  items: SaveCatalogItemInput[];
}

/** Atomic save of a reviewed upload via the create_user_catalog RPC. */
export function useSaveUserCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCatalogInput): Promise<string> => {
      const { data, error } = await rawSupabase.rpc("create_user_catalog", {
        p_name: input.name,
        p_source_filename: input.sourceFilename,
        p_items: input.items.map((item) => ({
          name: item.name,
          unit: item.unit,
          price_cents: item.priceCents,
          resource_type: item.resourceType,
          supplier_sku: item.supplierSku,
          matched_article_id: item.matchedArticleId,
          position: item.position,
        })),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userCatalogKeys.all });
    },
  });
}

export function useRenameUserCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { catalogId: string; name: string }) => {
      const { error } = await rawSupabase
        .from("user_catalogs")
        .update({ name: input.name })
        .eq("id", input.catalogId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userCatalogKeys.all });
    },
  });
}

export function useDeleteUserCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (catalogId: string) => {
      const { error } = await rawSupabase.from("user_catalogs").delete().eq("id", catalogId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userCatalogKeys.all });
    },
  });
}

export interface UpdateCatalogItemInput {
  itemId: string;
  patch: Partial<{
    name: string;
    unit: string;
    priceCents: number;
    resourceType: ResourceLineType;
    supplierSku: string | null;
    matchedArticleId: string | null;
  }>;
}

export function useUpdateUserCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, patch }: UpdateCatalogItemInput) => {
      const update: Record<string, unknown> = {};
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.unit !== undefined) update.unit = patch.unit;
      if (patch.priceCents !== undefined) update.price_cents = patch.priceCents;
      if (patch.resourceType !== undefined) update.resource_type = patch.resourceType;
      if (patch.supplierSku !== undefined) update.supplier_sku = patch.supplierSku;
      if (patch.matchedArticleId !== undefined) update.matched_article_id = patch.matchedArticleId;
      const { error } = await rawSupabase
        .from("user_catalog_items")
        .update(update)
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userCatalogKeys.all });
    },
  });
}

export function useAddUserCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      catalogId: string;
      item: Omit<SaveCatalogItemInput, "position">;
      position: number;
    }): Promise<UserCatalogItem> => {
      const { data, error } = await rawSupabase
        .from("user_catalog_items")
        .insert({
          catalog_id: input.catalogId,
          position: input.position,
          name: input.item.name,
          unit: input.item.unit,
          price_cents: input.item.priceCents,
          resource_type: input.item.resourceType,
          supplier_sku: input.item.supplierSku,
          matched_article_id: input.item.matchedArticleId,
        })
        .select(ITEM_COLUMNS)
        .single();
      if (error) throw error;
      return normalizeItem(data as UserCatalogItemRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userCatalogKeys.all });
    },
  });
}

export function useDeleteUserCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await rawSupabase.from("user_catalog_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userCatalogKeys.all });
    },
  });
}

/**
 * Display names for matched canonical articles (matched_article_id stores
 * only the id; the catalog page resolves names for its "Артикул Rovno"
 * column in one lookup).
 */
export function useMatchedArticleNames(ids: string[], enabled: boolean) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: [...userCatalogKeys.all, "article-names", sorted.join(",")],
    enabled: enabled && sorted.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await rawSupabase
        .from("system_resource_articles")
        .select("id, name, canonical_name")
        .in("id", sorted);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ id: string; name: string; canonical_name: string | null }>) {
        map.set(row.id, row.canonical_name ?? row.name);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}
