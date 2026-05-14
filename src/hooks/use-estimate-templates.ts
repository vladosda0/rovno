import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-mock-data";

const rawSupabase = supabase as unknown as SupabaseClient;

export type EstimateTemplateOwnerKind = "system" | "org" | "profile";

export interface EstimateTemplateSummary {
  id: string;
  ownerKind: EstimateTemplateOwnerKind;
  ownerLabel: string;
  title: string;
  description: string | null;
  scope: string | null;
  publishedToPublic: boolean;
  coverImageUrl: string | null;
  stageCount: number;
  isManageable: boolean;
  updatedAt: string;
}

interface EstimateTemplateListRow {
  id: string;
  owner_kind: string;
  owner_label: string;
  title: string;
  description: string | null;
  scope: string | null;
  published_to_public: boolean;
  cover_image_url: string | null;
  stage_count: number;
  is_manageable: boolean;
  updated_at: string;
}

function normalizeOwnerKind(value: string): EstimateTemplateOwnerKind {
  if (value === "system" || value === "org" || value === "profile") return value;
  return "profile";
}

export function useEstimateTemplates(scopeFilter?: string | null) {
  const currentUser = useCurrentUser();
  return useQuery({
    queryKey: ["estimate_templates", "list", currentUser?.id ?? null, scopeFilter ?? null],
    queryFn: async (): Promise<EstimateTemplateSummary[]> => {
      const { data, error } = await rawSupabase.rpc("list_estimate_templates", {
        p_scope_filter: scopeFilter ?? null,
      });
      if (error) throw error;
      const rows = (data ?? []) as EstimateTemplateListRow[];
      return rows.map((row) => ({
        id: row.id,
        ownerKind: normalizeOwnerKind(row.owner_kind),
        ownerLabel: row.owner_label,
        title: row.title,
        description: row.description,
        scope: row.scope,
        publishedToPublic: row.published_to_public,
        coverImageUrl: row.cover_image_url,
        stageCount: row.stage_count ?? 0,
        isManageable: row.is_manageable,
        updatedAt: row.updated_at,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface EstimateTemplateResourceLine {
  id: string;
  title: string;
  resourceType: string;
  unitDisplay: string | null;
  qtyDefault: number;
  defaultCostUnitCents: number | null;
  defaultMarkupBps: number | null;
  defaultDiscountBps: number | null;
  systemResourceArticleId: string | null;
  sortHint: number;
}

export interface EstimateTemplateWork {
  id: string;
  title: string;
  description: string | null;
  sortHint: number;
  resourceLines: EstimateTemplateResourceLine[];
}

export interface EstimateTemplateStage {
  id: string;
  title: string;
  description: string | null;
  scopeTag: string | null;
  sortHint: number;
  workCount: number;
  resourceCount: number;
  works: EstimateTemplateWork[];
}

export interface EstimateTemplateDetail {
  id: string;
  ownerKind: EstimateTemplateOwnerKind;
  ownerId: string | null;
  title: string;
  description: string | null;
  scope: string | null;
  publishedToPublic: boolean;
  coverImageUrl: string | null;
  updatedAt: string;
  createdAt: string;
  stages: EstimateTemplateStage[];
}

interface RawTemplateRow {
  id: string;
  owner_kind: string;
  owner_id: string | null;
  title: string;
  description: string | null;
  scope: string | null;
  published_to_public: boolean;
  cover_image_url: string | null;
  updated_at: string;
  created_at: string;
}

interface RawResourceLine {
  id: string;
  title: string;
  resource_type: string;
  unit_display: string | null;
  qty_default: number;
  default_cost_unit_cents: number | null;
  default_markup_bps: number | null;
  default_discount_bps: number | null;
  system_resource_article_id: string | null;
  sort_hint: number;
}

interface RawWork {
  id: string;
  title: string;
  description: string | null;
  sort_hint: number;
  resource_lines: RawResourceLine[] | null;
}

interface RawStage {
  id: string;
  title: string;
  description: string | null;
  scope_tag: string | null;
  sort_hint: number;
  work_count: number;
  resource_count: number;
  works: RawWork[] | null;
}

interface RawTemplateDetail {
  template: RawTemplateRow | null;
  stages: RawStage[] | null;
}

export function useEstimateTemplateDetail(templateId: string | null | undefined) {
  const currentUser = useCurrentUser();
  return useQuery({
    queryKey: ["estimate_templates", "detail", currentUser?.id ?? null, templateId ?? null],
    enabled: Boolean(templateId),
    queryFn: async (): Promise<EstimateTemplateDetail | null> => {
      if (!templateId) return null;
      const { data, error } = await rawSupabase.rpc("get_estimate_template_detail", {
        p_template_id: templateId,
      });
      if (error) throw error;
      if (!data) return null;
      const raw = data as RawTemplateDetail;
      const tpl = raw.template;
      if (!tpl) return null;
      const stages: EstimateTemplateStage[] = (raw.stages ?? []).map((stage) => ({
        id: stage.id,
        title: stage.title,
        description: stage.description,
        scopeTag: stage.scope_tag,
        sortHint: stage.sort_hint,
        workCount: stage.work_count ?? 0,
        resourceCount: stage.resource_count ?? 0,
        works: (stage.works ?? []).map((work) => ({
          id: work.id,
          title: work.title,
          description: work.description,
          sortHint: work.sort_hint,
          resourceLines: (work.resource_lines ?? []).map((line) => ({
            id: line.id,
            title: line.title,
            resourceType: line.resource_type,
            unitDisplay: line.unit_display,
            qtyDefault: line.qty_default,
            defaultCostUnitCents: line.default_cost_unit_cents,
            defaultMarkupBps: line.default_markup_bps,
            defaultDiscountBps: line.default_discount_bps,
            systemResourceArticleId: line.system_resource_article_id,
            sortHint: line.sort_hint,
          })),
        })),
      }));
      return {
        id: tpl.id,
        ownerKind: normalizeOwnerKind(tpl.owner_kind),
        ownerId: tpl.owner_id,
        title: tpl.title,
        description: tpl.description,
        scope: tpl.scope,
        publishedToPublic: tpl.published_to_public,
        coverImageUrl: tpl.cover_image_url,
        updatedAt: tpl.updated_at,
        createdAt: tpl.created_at,
        stages,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
