import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

// tbank RPC is not in the generated Database type; use the untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

interface AutoRenewToggleProps {
  subscriptionId: string;
  autoRenew: boolean;
  onChanged?: (value: boolean) => void;
}

export function AutoRenewToggle({ subscriptionId, autoRenew, onChanged }: AutoRenewToggleProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(autoRenew);
  const [pending, setPending] = useState(false);

  const handleChange = async (next: boolean) => {
    setPending(true);
    setValue(next);
    const { error } = await rawSupabase.rpc("tbank_set_auto_renew", {
      p_subscription_id: subscriptionId,
      p_auto_renew: next,
    });
    setPending(false);
    if (error) {
      setValue(!next);
      toast({ title: t("settings.billing.autoRenewError"), variant: "destructive" });
      return;
    }
    trackEvent("billing_auto_renew_toggled", { auto_renew: next });
    onChanged?.(next);
    toast({
      title: next ? t("settings.billing.autoRenewOnDone") : t("settings.billing.autoRenewOffDone"),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-foreground">{t("settings.billing.autoRenew")}</p>
        <p className="text-caption text-muted-foreground">{t("billing.checkout.autoRenewHint")}</p>
      </div>
      <Switch checked={value} disabled={pending} onCheckedChange={handleChange} />
    </div>
  );
}
