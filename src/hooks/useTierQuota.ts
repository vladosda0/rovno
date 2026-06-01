import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";

// get_current_usage is not in the generated Database type (the tier-enforcement
// migrations are excluded from the backend-truth mirror); use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

export type TierPlanCode = "free" | "master" | "brigade";
export type AiUsageType = "chat" | "doc" | "photo";

export interface TierQuota {
  plan_code: TierPlanCode;
  ai_chat_used: number;
  ai_chat_limit: number;
  ai_doc_used: number;
  ai_doc_limit: number;
  ai_photo_used: number;
  ai_photo_limit: number;
  estimates_used: number;
  estimates_limit: number;
  period_start: string;
  period_end: string;
}

export const TIER_QUOTA_QUERY_KEY = ["tier-quota"] as const;

const PLAN_RANK: Record<string, number> = { free: 0, master: 1, brigade: 2 };

/** True when `plan` is at least as high a tier as `required`. */
export function planMeets(plan: string | undefined, required: TierPlanCode): boolean {
  if (!plan) return false;
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[required] ?? 99);
}

/** Pick the used/limit pair for a given AI usage slot. */
export function selectAiUsage(
  quota: TierQuota,
  usageType: AiUsageType,
): { used: number; limit: number } {
  switch (usageType) {
    case "doc":
      return { used: quota.ai_doc_used, limit: quota.ai_doc_limit };
    case "photo":
      return { used: quota.ai_photo_used, limit: quota.ai_photo_limit };
    default:
      return { used: quota.ai_chat_used, limit: quota.ai_chat_limit };
  }
}

export function useTierQuota() {
  const { status, profileId } = useRuntimeAuth();
  return useQuery({
    // Key by profile so a sign-out/sign-in in the same browser session can't
    // serve user A's cached quota to user B (codex P2). TIER_QUOTA_QUERY_KEY stays
    // the prefix, so invalidateQueries({ queryKey: TIER_QUOTA_QUERY_KEY }) still
    // matches the profile-scoped entry.
    queryKey: [...TIER_QUOTA_QUERY_KEY, profileId],
    queryFn: async (): Promise<TierQuota | null> => {
      const { data, error } = await rawSupabase.rpc("get_current_usage");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as TierQuota | undefined) ?? null;
    },
    enabled: status === "authenticated" && Boolean(profileId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
