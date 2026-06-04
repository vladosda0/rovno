import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

const rawSupabase = supabase as unknown as SupabaseClient;

interface CancelSubscriptionDialogProps {
  subscriptionId: string;
  activeUntilLabel: string | null;
  onCancelled?: () => void;
}

// "Cancel" here means turning off auto-renew (MVP per design §15.3/§15.4): access
// stays until the period ends, then the soft read-only block applies.
export function CancelSubscriptionDialog({
  subscriptionId,
  activeUntilLabel,
  onCancelled,
}: CancelSubscriptionDialogProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    trackEvent("billing_subscription_cancel_requested");
    const { error } = await rawSupabase.rpc("tbank_set_auto_renew", {
      p_subscription_id: subscriptionId,
      p_auto_renew: false,
    });
    setPending(false);
    if (error) {
      toast({ title: t("settings.billing.autoRenewError"), variant: "destructive" });
      return;
    }
    toast({ title: t("settings.billing.cancelDone") });
    onCancelled?.();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="text-caption text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          {t("settings.billing.cancel")}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.billing.cancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {activeUntilLabel
              ? t("settings.billing.cancelDescription", { date: activeUntilLabel })
              : t("settings.billing.cancelDescriptionNoDate")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("settings.billing.cancelKeep")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {t("settings.billing.cancelConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
