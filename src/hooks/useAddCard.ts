import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AddCardResponse } from "@/lib/billing";
import { messageFromInvokeFailure } from "@/hooks/useInitPayment";

// Wraps the tbank-add-card Edge Function: starts a T-Bank card-binding session (no
// real charge) and returns { request_key, customer_key, payment_url }. The UI mounts
// the addcardIframe widget with payment_url (or opens it as a hosted-page fallback);
// the fresh RebillId is captured server-side via the AddCard notification and copied
// onto the current subscription.
export function useAddCard() {
  return useMutation<AddCardResponse, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("tbank-add-card", {
        body: {},
      });
      if (error) {
        throw new Error(await messageFromInvokeFailure(error, data));
      }
      return data as AddCardResponse;
    },
  });
}
