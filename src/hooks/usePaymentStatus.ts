import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentIntentRow } from "@/lib/billing";

// tbank tables are not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

const TERMINAL_STATUSES = new Set([
  "confirmed",
  "rejected",
  "cancelled",
  "refunded",
  "partial_refund",
]);

export function isTerminalPaymentStatus(status: string | undefined | null): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

const POLL_INTERVAL_MS = 4000;
const PAYMENT_INTENT_COLUMNS =
  "id, profile_id, plan_code, amount_kopecks, currency, status, error_code, error_message, confirmed_at, created_at";

// Polls a single payment_intent until it reaches a terminal status. Polling is
// the reliable mechanism (the tbank tables are not in the realtime publication);
// a best-effort realtime subscription invalidates the query for instant updates
// when realtime is available, otherwise it simply never fires.
export function usePaymentStatus(intentId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["payment-intent", intentId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!intentId,
    refetchInterval: (q) => {
      const row = q.state.data as PaymentIntentRow | null | undefined;
      return isTerminalPaymentStatus(row?.status) ? false : POLL_INTERVAL_MS;
    },
    queryFn: async (): Promise<PaymentIntentRow | null> => {
      if (!intentId) return null;
      const { data, error } = await rawSupabase
        .from("payment_intents")
        .select(PAYMENT_INTENT_COLUMNS)
        .eq("id", intentId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PaymentIntentRow | null;
    },
  });

  useEffect(() => {
    if (!intentId) return;
    const channel = rawSupabase
      .channel(`payment_intent:${intentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payment_intents",
          filter: `id=eq.${intentId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["payment-intent", intentId] });
        },
      )
      .subscribe();
    return () => {
      void rawSupabase.removeChannel(channel);
    };
  }, [intentId, queryClient]);

  return query;
}
