import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import {
  deriveSubscriptionStatus,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "@/lib/billing";

// tbank tables are not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

// rebill_id intentionally NOT selected (audit #2): it is a recurring-charge
// token-equivalent the UI never uses; keep it off the wire/cache.
const SUBSCRIPTION_COLUMNS =
  "id, profile_id, provider, plan_code, status, is_current, currency, amount_cents, auto_renew, current_period_starts_at, current_period_ends_at, canceled_at, grace_until, created_at, pending_plan_code";

export interface ActiveSubscription {
  status: SubscriptionStatus;
  subscription: SubscriptionRow | null;
  readOnly: boolean;
  isLoading: boolean;
  /** True when the fetch errored — callers must NOT treat this as "no subscription". */
  isError: boolean;
  refetch: () => void;
}

// Reads the caller's current subscription (RLS scopes to auth.uid(); a unique
// partial index guarantees at most one is_current row per profile). Returns a
// derived status: active / grace (period ended, <7d) / expired (read-only) /
// none (free user). See design §15.5.
export function useActiveSubscription(): ActiveSubscription {
  const { status: authStatus, profileId } = useRuntimeAuth();
  const enabled = authStatus === "authenticated" && !!profileId;

  const query = useQuery({
    queryKey: ["active-subscription", profileId],
    enabled,
    queryFn: async (): Promise<SubscriptionRow | null> => {
      const { data, error } = await rawSupabase
        .from("subscriptions")
        .select(SUBSCRIPTION_COLUMNS)
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SubscriptionRow | null;
    },
  });

  const subscription = query.data ?? null;
  const { status, readOnly } = deriveSubscriptionStatus(subscription);

  return {
    status,
    subscription,
    readOnly,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
