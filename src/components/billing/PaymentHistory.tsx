import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { PaymentDetailDialog } from "@/components/billing/PaymentDetailDialog";
import { formatRubFromKopecks, type PaymentIntentRow } from "@/lib/billing";
import { PLANS } from "@/data/plans";

const rawSupabase = supabase as unknown as SupabaseClient;
const COLUMNS =
  "id, profile_id, plan_code, amount_kopecks, currency, status, error_code, error_message, confirmed_at, created_at";

export function PaymentHistory() {
  const { t, i18n } = useTranslation();
  const { profileId, user } = useRuntimeAuth();

  const { data, isLoading } = useQuery({
    // L1: scope the cache to the profile so a user switch can't flash the
    // previous account's history.
    queryKey: ["payment-history", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<PaymentIntentRow[]> => {
      const { data, error } = await rawSupabase
        .from("payment_intents")
        // Show completed money movements: a successful payment AND its later
        // full refund are the SAME row whose status flips confirmed -> refunded.
        // Filtering to 'confirmed' alone hid refunded payments entirely, so a
        // "paid then refunded" user saw an empty history. Failed attempts
        // (rejected/cancelled) stay excluded as retry noise. partial_refund is
        // intentionally excluded for now: its correct UX (show the refunded
        // amount + allow refunding the remaining balance) is a separate follow-up,
        // and until then a partial row must not render as a plain full refund.
        .select(COLUMNS)
        .in("status", ["confirmed", "refunded"])
        // Order by created_at (always set), not confirmed_at: a refunded row from
        // an out-of-order REFUNDED-before-CONFIRMED callback has confirmed_at NULL,
        // and Postgres DESC defaults to NULLS FIRST, which would float it to the
        // top as if newest. created_at also matches the displayed-date fallback
        // (confirmed_at ?? created_at) below.
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as PaymentIntentRow[];
    },
  });

  if (isLoading) {
    return <p className="text-caption text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-caption text-muted-foreground">{t("settings.billing.historyEmpty")}</p>;
  }

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <ul className="space-y-0.5">
      {data.map((row) => {
        const name = PLANS[row.plan_code as keyof typeof PLANS]?.display_name ?? row.plan_code;
        const when = row.confirmed_at ?? row.created_at;
        const isRefunded = row.status === "refunded";
        return (
          <li key={row.id}>
            {/* The whole row opens the payment detail + refund-request dialog.
                "Request refund" is no longer a standalone control in the list;
                it lives inside the dialog, which only offers a refund for rows
                still in 'confirmed' (refunded rows show an info note instead). */}
            <PaymentDetailDialog
              payment={row}
              userEmail={user?.email ?? ""}
              trigger={
                <button
                  type="button"
                  className="flex w-full items-center gap-sp-2 rounded-md px-sp-2 py-1.5 text-left text-body-sm transition-colors hover:bg-muted/50"
                >
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {dateFmt.format(new Date(when))}
                  </span>
                  <span className="flex-1 truncate text-foreground">{name}</span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">
                    {formatRubFromKopecks(row.amount_kopecks)}
                  </span>
                  {isRefunded ? (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
                      {t("billing.payment.statusRefunded")}
                    </span>
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-success" />
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
