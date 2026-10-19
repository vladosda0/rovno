import { supabase } from "@/integrations/supabase/client";

// Asks the backend to check the caller's pending card bindings with T-Bank
// (tbank-reconcile-card-binding) and resolves true when the card on file changed.
// Best-effort by design: any failure, including a backend that does not have the
// function yet, resolves false. The AddCard notification remains a second path.
export async function syncCardBinding(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("tbank-reconcile-card-binding", {
      body: {},
    });
    if (error || !data || typeof data !== "object") return false;
    return (data as { card_changed?: unknown }).card_changed === true;
  } catch {
    return false;
  }
}
