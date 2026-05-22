import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InitPaymentResponse } from "@/lib/billing";

export interface InitPaymentArgs {
  readonly plan_code: string;
  readonly receipt_email: string;
  readonly auto_renew: boolean;
  readonly idempotency_key: string;
}

// Wraps the tbank-init-payment Edge Function. The phase 1b contract is
// { plan_code, receipt_email, auto_renew, idempotency_key } in, and
// { intent_id, payment_id, status, amount_kopecks, plan_display_name } out.
// There is intentionally no billing_period: phase 1c is monthly-only.
export function useInitPayment() {
  return useMutation<InitPaymentResponse, Error, InitPaymentArgs>({
    mutationFn: async (args) => {
      const { data, error } = await supabase.functions.invoke("tbank-init-payment", {
        body: args,
      });
      if (error) {
        throw new Error(await messageFromInvokeFailure(error, data));
      }
      return data as InitPaymentResponse;
    },
  });
}

// On FunctionsHttpError, error.context is the raw (unconsumed) Response. Read it
// so the toast shows the backend reason (matches src/data/workspace-source.ts).
async function messageFromInvokeFailure(error: unknown, data: unknown): Promise<string> {
  const fromData = parseErrorBody(data);
  if (fromData) return fromData;

  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && ctx instanceof Response) {
      const raw = (await ctx.clone().text().catch(() => "")).trim();
      if (raw) {
        const parsed = parseErrorBody(safeJsonParse(raw));
        if (parsed) return parsed;
        return raw.length <= 400 ? raw : `${raw.slice(0, 400)}…`;
      }
      const statusText = ctx.statusText?.trim();
      return statusText ? `HTTP ${ctx.status} ${statusText}` : `HTTP ${ctx.status}`;
    }
  }

  if (error && typeof error === "object" && "message" in error
    && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Не удалось инициализировать платёж";
}

function parseErrorBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string" && record.message) return record.message;
  if (typeof record.error === "string" && record.error) return record.error;
  return null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
