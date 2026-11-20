import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthCard } from "@/components/auth/AuthCard";
import { AppCodeField } from "@/components/auth/AppCodeField";
import { APP_CODE_LENGTH } from "@/lib/app-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { callMfaRecovery, isSecondStepRequired, listTotpFactors, mfaNext, type TotpFactor, verifyAppCode } from "@/lib/mfa";
import { withPasskeyOffer } from "@/lib/passkey-offer";
import { confirmExternalProof, dropPendingLink, type ExternalResult, type LoginProvider, takePendingLink } from "@/lib/external-login";
import { cn } from "@/lib/utils";

/**
 * The second sign-in step (epic external-login, slice 4, mockup frames 4 and 5): after a
 * password, a code from the letter, Yandex ID or VK ID, a person with the protection on
 * enters the six digits from the app. «Нет доступа к телефону?» opens the recovery code,
 * which lets them in by turning the protection off (like Stripe's backup code).
 */

type Step = "checking" | "app" | "recovery" | "off";

const LINKED: Record<LoginProvider, string> = { yandex: "security.connected.linkedToast", vk: "security.connected.vkLinkedToast" };
const HAS_OWN: Record<LoginProvider, string> = { yandex: "security.connected.hasYandex", vk: "security.connected.hasVk" };
const LINK_FAILED: Record<LoginProvider, string> = { yandex: "auth.yandex.failed", vk: "auth.vk.failed" };

const STEP_CLASS = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:slide-in-from-bottom-0";

export default function MfaChallenge() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = mfaNext(searchParams.get("next"));
  const [step, setStep] = useState<Step>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        navigate(`/auth/login?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      if (!(await isSecondStepRequired())) {
        navigate(next, { replace: true });
        return;
      }
      let verified = (await listTotpFactors().catch((): TotpFactor[] => [])).find((f) => f.status === "verified");
      if (!verified) {
        // The local session may still carry a factor that is gone (a recovery code used in
        // another tab): a fresh session settles whether the step is still owed.
        await supabase.auth.refreshSession().catch(() => undefined);
        if (cancelled) return;
        if (!(await isSecondStepRequired())) {
          navigate(next, { replace: true });
          return;
        }
        verified = (await listTotpFactors().catch((): TotpFactor[] => [])).find((f) => f.status === "verified");
      }
      if (cancelled) return;
      setFactorId(verified?.id ?? null);
      setStep("app");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  // A Yandex ID or VK ID that the sign-in proved but could not link before the second step
  // (ExternalLoginCallback, «Привязка после шести цифр»). A recovery code proves the account
  // too, so it finishes the link as well. A failed link never keeps the person out.
  const finishPendingLink = async () => {
    const { data } = await supabase.auth.getSession();
    const pending = takePendingLink(data.session?.user?.id);
    if (!pending) return;
    const result: ExternalResult = await confirmExternalProof(pending.provider, pending.token).catch(() => ({ outcome: "failed" as const }));
    if (result.outcome === "linked") toast({ title: t(LINKED[pending.provider]) });
    else if (result.outcome === "has_yandex" || result.outcome === "has_vk") toast({ title: t(HAS_OWN[pending.provider]), variant: "destructive" });
    else toast({ title: t(LINK_FAILED[pending.provider]), variant: "destructive" });
  };

  // After the code from the app, «Входите быстрее» may come first (slice 5, step 5.8); after a
  // recovery code it does not (that path ends on its own screen, step «off»).
  const signInDone = async () => {
    toast({ title: t("auth.login.successTitle"), description: t("auth.login.successDescription") });
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const userId = data.session?.user?.id;
    navigate(userId ? await withPasskeyOffer(next, { userId }) : next, { replace: true });
  };

  const checkApp = async (value: string) => {
    if (inFlight.current) return;
    if (!factorId) {
      setError(t("auth.mfa.failed"));
      return;
    }
    if (value.length < APP_CODE_LENGTH) {
      setError(t("security.twoFa.codeShort"));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const verdict = await verifyAppCode(factorId, value);
      if (verdict === "ok") {
        await finishPendingLink();
        await signInDone();
        return;
      }
      setCode("");
      setError(t(verdict === "invalid" ? "auth.mfa.invalid" : verdict === "too_many" ? "auth.mfa.tooMany" : "auth.mfa.failed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const checkRecovery = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await callMfaRecovery("redeem", { code: recovery });
      // 409: the protection is already off (a recovery code used elsewhere); same outcome.
      if (result.status === 200 || result.body.error === "not_enabled") {
        // The factor is gone: a refreshed session is a plain one with full access.
        await supabase.auth.refreshSession().catch(() => undefined);
        await finishPendingLink();
        setStep("off");
        return;
      }
      setError(t(result.body.error === "too_many" ? "auth.mfa.recoveryTooMany" : result.body.error === "invalid" ? "auth.mfa.recoveryInvalid" : "auth.mfa.failed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const otherAccount = async () => {
    dropPendingLink();
    await supabase.auth.signOut().catch(() => undefined);
    navigate("/auth/login", { replace: true });
  };

  const switchTo = (target: "app" | "recovery") => {
    setError(null);
    setCode("");
    setRecovery("");
    setStep(target);
  };

  const linkClass = "text-body-sm text-accent hover:underline";

  if (step === "checking") {
    return (
      <AuthCard title={t("auth.mfa.title")} subtitle={t("auth.mfa.subtitle")}>
        <div className="h-12 animate-pulse rounded-md bg-muted/60" aria-hidden />
      </AuthCard>
    );
  }

  if (step === "off") {
    return (
      <div key="off" className={STEP_CLASS}>
        <AuthCard title={t("auth.mfa.offTitle")} subtitle={t("auth.mfa.offSubtitle")}>
          <Button type="button" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => navigate("/settings?tab=security&mfa=enable", { replace: true })}>
            {t("auth.mfa.enableAgain")}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate(next, { replace: true })}>
            {t("auth.mfa.later")}
          </Button>
        </AuthCard>
      </div>
    );
  }

  if (step === "recovery") {
    return (
      <div key="recovery" className={STEP_CLASS}>
        <AuthCard title={t("auth.mfa.recoveryTitle")} subtitle={t("auth.mfa.recoverySubtitle")}>
          <form className="space-y-sp-2" onSubmit={(e) => { e.preventDefault(); void checkRecovery(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-recovery-code">{t("auth.mfa.recoveryLabel")}</Label>
              <Input
                id="mfa-recovery-code"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                value={recovery}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "mfa-recovery-error" : undefined}
                className={cn("font-mono tracking-wider", error && "border-destructive")}
                onChange={(e) => {
                  setRecovery(e.target.value);
                  if (error) setError(null);
                }}
              />
              {error && <p id="mfa-recovery-error" role="alert" className="text-caption text-destructive">{error}</p>}
            </div>
            <Button type="submit" disabled={busy || recovery.trim().length === 0} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {t("auth.mfa.submit")}
            </Button>
            <div className="flex flex-col items-center gap-1 text-center">
              <button type="button" className={linkClass} onClick={() => switchTo("app")}>{t("auth.mfa.useApp")}</button>
              <button type="button" className={linkClass} onClick={() => void otherAccount()}>{t("auth.mfa.otherAccount")}</button>
            </div>
          </form>
        </AuthCard>
      </div>
    );
  }

  return (
    <div key="app" className={STEP_CLASS}>
      <AuthCard title={t("auth.mfa.title")} subtitle={t("auth.mfa.subtitle")}>
        <form className="space-y-sp-2" onSubmit={(e) => { e.preventDefault(); void checkApp(code); }}>
          <AppCodeField
            label={t("auth.mfa.label")}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error) setError(null);
            }}
            onComplete={(value) => void checkApp(value)}
            error={error}
            disabled={busy}
            autoFocus
          />
          <Button type="submit" disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {t("auth.mfa.submit")}
          </Button>
          <div className="flex flex-col items-center gap-1 text-center">
            <button type="button" className={linkClass} onClick={() => switchTo("recovery")}>{t("auth.mfa.useRecovery")}</button>
            <button type="button" className={linkClass} onClick={() => void otherAccount()}>{t("auth.mfa.otherAccount")}</button>
          </div>
        </form>
      </AuthCard>
    </div>
  );
}
