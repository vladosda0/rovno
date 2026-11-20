import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { mfaNext } from "@/lib/mfa";
import { declinePasskeyOffer, setUpPasskeyHere } from "@/lib/passkey";
import { passkeysEnabledOnServer } from "@/lib/passkey-availability";

/**
 * «Входите быстрее» (epic external-login, slice 5, step 5.8, mockup frame 9): between a
 * sign-in by password, code from the email, Yandex ID or VK ID and the page the person was
 * going to. Who sees it is decided by `withPasskeyOffer`; this screen only offers. «Настроить»
 * is the same setup as in «Безопасность»; «Не сейчас» is remembered in this browser for 30
 * days, and after the third time the screen does not come back.
 */
export default function FasterSignIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = mfaNext(searchParams.get("next"));
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([supabase.auth.getSession(), passkeysEnabledOnServer()]).then(([{ data }, enabled]) => {
      if (cancelled) return;
      const id = data.session?.user?.id ?? null;
      if (!id) navigate(`/auth/login?next=${encodeURIComponent(next)}`, { replace: true });
      // Opened by address while Auth has the sign-in off: nothing to offer, go on.
      else if (!enabled) navigate(next, { replace: true });
      else setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  const setUp = async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const outcome = await setUpPasskeyHere(userId);
      if (outcome.kind === "ok") {
        toast({ title: t("security.passkey.setUpDone"), description: t("security.passkey.setUpDoneText") });
        navigate(next, { replace: true });
        return;
      }
      // Already set up here (the browser knows it): nothing to offer, go on.
      if (outcome.error === "exists") {
        navigate(next, { replace: true });
        return;
      }
      // A closed window returns to the offer as it was (mockup frame 9).
      if (outcome.error !== "cancel") setError(t("security.twoFa.failed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const later = () => {
    declinePasskeyOffer();
    navigate(next, { replace: true });
  };

  if (!userId) return null;

  return (
    <div className="glass-modal rounded-modal p-sp-4 w-full max-w-md mx-auto animate-in fade-in-0 duration-200">
      <div className="text-center mb-sp-3">
        <div className="mx-auto mb-3 grid h-12 w-12 place-content-center rounded-[14px] bg-accent/10 text-accent" aria-hidden>
          <KeyRound className="h-6 w-6" />
        </div>
        <h2 className="text-h3 text-foreground">{t("auth.passkey.offerTitle")}</h2>
        <p className="text-body-sm text-muted-foreground mt-1">{t("auth.passkey.offerText")}</p>
      </div>
      <div className="space-y-sp-2">
        <Button
          type="button"
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => void setUp()}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? t("auth.passkey.waiting") : t("auth.passkey.offerSetUp")}
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={later}>
          {t("auth.passkey.offerLater")}
        </Button>
        {error && (
          <p role="alert" className="text-caption text-destructive text-center">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
