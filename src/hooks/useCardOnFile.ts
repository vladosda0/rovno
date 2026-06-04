import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";

// tbank RPC is not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

export interface CardOnFile {
  last4: string;
  brand: string | null;
}

// Reads ONLY the masked last-4 + inferred brand of the card used for the latest
// confirmed payment, via the get_card_on_file RPC. RebillId and the rest of the
// T-Bank notification never reach the client. Returns null when no card is on
// file (e.g. promo/free users, or before the first confirmed payment).
export function useCardOnFile() {
  const { status, profileId } = useRuntimeAuth();
  const enabled = status === "authenticated" && !!profileId;

  return useQuery({
    queryKey: ["card-on-file", profileId],
    enabled,
    queryFn: async (): Promise<CardOnFile | null> => {
      // get_card_on_file is a tbank RPC reached via the untyped client and is
      // intentionally excluded from the backend-truth contract (same family as the
      // other tbank RPCs). If it is not yet applied to the target environment,
      // degrade silently — hide the card line — rather than surfacing a
      // missing-function error; the rest of billing is unaffected (codex P2).
      const { data, error } = await rawSupabase.rpc("get_card_on_file");
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.last4) return null;
      return { last4: row.last4 as string, brand: (row.brand as string | null) ?? null };
    },
    retry: false,
  });
}
