import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

// redeem_promo_code is not in the generated Database type (the promo table/RPC
// are outside the curated contract); reach it through the untyped client like the
// tbank RPCs.
const rawSupabase = supabase as unknown as SupabaseClient;

interface RedeemResult {
  status:
    | "ok"
    | "invalid_code"
    | "already_redeemed"
    | "expired"
    | "already_subscribed"
    | "unauthenticated";
  subscription_id?: string;
  plan_code?: string;
  expires_at?: string;
}

export default function PromoRedeem() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status } = useRuntimeAuth();
  const [code, setCode] = useState((searchParams.get("code") ?? "").toUpperCase());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackEvent("promo_redeem_page_viewed");
  }, []);

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy || status === "loading") return;

    if (status !== "authenticated") {
      // Guest: sign up first, then return here with the code prefilled so they
      // can submit again. Signup/Login honour the ?next= param (must start "/").
      const ret = `/promo/redeem?code=${encodeURIComponent(trimmed)}`;
      navigate(`/auth/signup?next=${encodeURIComponent(ret)}`);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await rawSupabase.rpc("redeem_promo_code", { p_code: trimmed });
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as RedeemResult | undefined;
      trackEvent("promo_redeem_attempted", { result: result?.status ?? "unknown" });

      switch (result?.status) {
        case "ok":
          toast({
            title: t("promo.redeem.success.title"),
            description: t("promo.redeem.success.description"),
          });
          navigate("/home");
          break;
        case "invalid_code":
          toast({ title: t("promo.redeem.error.invalid"), variant: "destructive" });
          break;
        case "already_redeemed":
          toast({ title: t("promo.redeem.error.alreadyRedeemed"), variant: "destructive" });
          break;
        case "expired":
          toast({ title: t("promo.redeem.error.expired"), variant: "destructive" });
          break;
        case "already_subscribed":
          toast({ title: t("promo.redeem.error.alreadySubscribed"), variant: "destructive" });
          break;
        default:
          toast({ title: t("promo.redeem.error.unknown"), variant: "destructive" });
      }
    } catch (e) {
      console.error(e);
      toast({ title: t("promo.redeem.error.network"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-sp-3">
      <div className="w-full max-w-md space-y-sp-3 rounded-panel glass-elevated p-sp-4">
        <div className="space-y-1 text-center">
          <h1 className="text-h2 text-foreground">{t("promo.redeem.title")}</h1>
          <p className="text-body-sm text-muted-foreground">{t("promo.redeem.subtitle")}</p>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("promo.redeem.placeholder")}
            disabled={busy}
            className="text-center font-mono text-body uppercase tracking-wider"
          />
          <Button
            type="submit"
            disabled={busy || status === "loading" || !code.trim()}
            className="w-full"
          >
            {busy ? t("promo.redeem.submitting") : t("promo.redeem.submit")}
          </Button>
        </form>

        <p className="text-center text-caption text-muted-foreground">
          <Link to="/" className="underline hover:text-foreground">
            {t("promo.redeem.backToLanding")}
          </Link>
        </p>
      </div>
    </div>
  );
}
