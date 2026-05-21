import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { RefundRequestDialog } from "@/components/billing/RefundRequestDialog";
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
        .select(COLUMNS)
        .eq("status", "confirmed")
        .order("confirmed_at", { ascending: false })
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
    <ul className="space-y-1.5">
      {data.map((row) => {
        const name = PLANS[row.plan_code as keyof typeof PLANS]?.display_name ?? row.plan_code;
        const when = row.confirmed_at ?? row.created_at;
        return (
          <li key={row.id} className="flex items-center justify-between gap-2 text-body-sm">
            <span className="text-muted-foreground">{dateFmt.format(new Date(when))}</span>
            <span className="flex-1 truncate text-foreground">{name}</span>
            <span className="font-medium text-foreground">
              {formatRubFromKopecks(row.amount_kopecks)}
            </span>
            <Check className="h-4 w-4 shrink-0 text-success" />
            {/* All listed rows are status='confirmed', so every row is refundable. */}
            <RefundRequestDialog payment={row} userEmail={user?.email ?? ""} />
          </li>
        );
      })}
    </ul>
  );
}
