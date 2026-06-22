import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const rawSupabase = supabase as unknown as SupabaseClient;

export interface ConstructorResourceLine {
  id: string;
  title: string;
  resourceType: string;
  unitDisplay: string | null;
  qtyDefault: number;
  systemResourceArticleId: string | null;
}

export interface ConstructorWork {
  templateWorkId: string;
  systemWorkArticleId: string | null;
  title: string;
  resourceCount: number;
  resourceLines: ConstructorResourceLine[];
}

export interface ConstructorStage {
  templateStageId: string;
  systemStageArticleId: string | null;
  title: string;
  workCount: number;
  resourceCount: number;
  works: ConstructorWork[];
}

export interface ConstructorTemplate {
  templateId: string;
  title: string;
  stages: ConstructorStage[];
}

interface RawLine {
  id: string;
  title: string;
  resource_type: string;
  unit_display: string | null;
  qty_default: number;
  system_resource_article_id: string | null;
}
interface RawWork {
  template_work_id: string;
  system_work_article_id: string | null;
  title: string;
  resource_count: number;
  resource_lines: RawLine[] | null;
}
interface RawStage {
  template_stage_id: string;
  system_stage_article_id: string | null;
  title: string;
  work_count: number;
  resource_count: number;
  works: RawWork[] | null;
}
interface RawTree {
  template: { id: string; title: string } | null;
  stages: RawStage[] | null;
}

/** list_canonical_stages_with_works(null) -> the rovno.ai constructor browse tree. */
export function useCanonicalStagesWithWorks(enabled: boolean) {
  return useQuery({
    queryKey: ["canonical_stages_with_works", "system"],
    enabled,
    queryFn: async (): Promise<ConstructorTemplate | null> => {
      const { data, error } = await rawSupabase.rpc("list_canonical_stages_with_works", {
        p_template_id: null,
      });
      if (error) throw error;
      if (!data) return null;
      const raw = data as RawTree;
      if (!raw.template) return null;
      return {
        templateId: raw.template.id,
        title: raw.template.title,
        stages: (raw.stages ?? []).map((stage) => ({
          templateStageId: stage.template_stage_id,
          systemStageArticleId: stage.system_stage_article_id,
          title: stage.title,
          workCount: stage.work_count ?? 0,
          resourceCount: stage.resource_count ?? 0,
          works: (stage.works ?? []).map((work) => ({
            templateWorkId: work.template_work_id,
            systemWorkArticleId: work.system_work_article_id,
            title: work.title,
            resourceCount: work.resource_count ?? 0,
            resourceLines: (work.resource_lines ?? []).map((line) => ({
              id: line.id,
              title: line.title,
              resourceType: line.resource_type,
              unitDisplay: line.unit_display,
              qtyDefault: line.qty_default,
              systemResourceArticleId: line.system_resource_article_id,
            })),
          })),
        })),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
