import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../backend-truth/generated/supabase-types";
import {
  mapPortfolioSnapshotFromRpc,
  type PortfolioFinanceSnapshot,
} from "@/lib/finance/portfolio-read-model";

type TypedSupabaseClient = SupabaseClient<Database>;

// The shared client is typed against the small legacy types file; the RPC contract lives
// in the generated backend-truth Database type, so cast like estimate-source does.
async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

/**
 * Supabase-backed portfolio finance rollup. The RPC already applies sensitive-detail
 * redaction server-side, so the mapped snapshot is display-ready. Throws on RPC error,
 * matching the codebase convention (see estimate-source loadEstimateOperationalSummary).
 */
export async function loadPortfolioFinanceSnapshot(): Promise<PortfolioFinanceSnapshot> {
  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase.rpc("get_portfolio_finance_snapshot");
  if (error) {
    throw error;
  }
  return mapPortfolioSnapshotFromRpc(data);
}
