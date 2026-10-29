import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { EmailCodeStep } from "@/components/auth/EmailCodeStep";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearDemoSession, hasCompletedOnboarding, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { setAnalyticsUserId, trackEventOncePerUser, type AuthMethod } from "@/lib/analytics";
import { safeNextPath } from "@/lib/safe-next-path";

type LoginMode = "password" | "code" | "code-sent";

/**
 * Replies the screen treats like a sent code, so the page does not tell a
 * stranger whether the account exists: `otp_disabled` for an address without an
 * account (no letter goes out), and the per-address resend cooldown ("…after N
 * seconds"; its earlier code is still valid). The server-wide email limit shares
 * the error code and stays a visible failure. The API itself still answers
 * differently; accepted for now (epic external-login, slice 1).
 */
function isSameScreenReply(error: { code?: string; message?: string } | null): boolean {
  if (error?.code === "otp_disabled") return true;
  return error?.code === "over_email_send_rate_limit" && /after \d+ seconds?/i.test(error.message ?? "");
}

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<LoginMode>("password");
  const safeNext = safeNextPath(searchParams.get("next"));
  const confirmed = searchParams.get("confirmed") === "1";

  useEffect(() => {
    if (confirmed) {
      toast({
        title: t("auth.login.emailConfirmedTitle"),
        description: t("auth.login.emailConfirmedDescription"),
      });
    }
  }, [confirmed, t]);

  const resolveDestination = (completedOnboarding: boolean): string => {
    if (safeNext) return safeNext;
    return completedOnboarding ? "/home" : "/onboarding";
  };

  const finishSignIn = async (user: User, method: AuthMethod) => {
    clearDemoSession();
    clearAiSidebarSessionPreference();
    setAuthRole("owner");

    // Set the analytics user id now so the once-per-user guard below keys on
    // the real user id (AppLayout also sets it post-navigation; idempotent).
    setAnalyticsUserId(user.id);

    // "First login" = the user's first sign-in while still in the signup
    // funnel (onboarding not completed). Once-per-user guarded so repeated
    // pre-onboarding logins can't re-fire this funnel step and inflate
    // activation/retention metrics.
    const completedOnboarding = await hasCompletedOnboarding(user.id);
    if (!completedOnboarding) {
      trackEventOncePerUser("first_login", { user_id: user.id, via: "login", method });
    }

    toast({ title: t("auth.login.successTitle"), description: t("auth.login.successDescription") });
    navigate(resolveDestination(completedOnboarding));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: t("auth.login.validationTitle"), description: t("auth.login.validationDescription"), variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      if (!data.session?.user) {
        throw new Error(t("auth.login.noSession"));
      }

      await finishSignIn(data.session.user, "password");
    } catch (error) {
      toast({
        title: t("auth.login.failureTitle"),
        description: error instanceof Error ? error.message : t("auth.login.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Sign-in only: an unknown address gets no letter and no new account.
  const sendCode = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    if (error && !isSameScreenReply(error)) throw error;
  };

  const handleCodeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await sendCode();
      setMode("code-sent");
    } catch (error) {
      toast({
        title: t("auth.login.failureTitle"),
        description: error instanceof Error ? error.message : t("auth.login.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (mode === "code-sent") {
    return (
      <EmailCodeStep
        email={email.trim()}
        onVerified={(session) => finishSignIn(session.user, "email_code")}
        onResend={async () => {
          try {
            await sendCode();
          } catch (error) {
            toast({
              title: t("auth.login.failureTitle"),
              description: error instanceof Error ? error.message : t("auth.login.genericFailure"),
              variant: "destructive",
            });
          }
        }}
        onChangeEmail={() => setMode("code")}
      />
    );
  }

  const primaryButtonClass = "w-full bg-accent text-accent-foreground hover:bg-accent/90";

  return (
    <AuthCard
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <div className="flex items-center justify-between text-body-sm">
          <Link to="/auth/forgot" className="text-accent hover:underline">{t("auth.login.forgotPassword")}</Link>
          <Link to={safeNext ? `/auth/signup?next=${encodeURIComponent(safeNext)}` : "/auth/signup"} className="text-accent hover:underline">{t("auth.login.createAccount")}</Link>
        </div>
      }
    >
      {mode === "password" ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-sp-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input id="email" type="email" autoComplete="email" placeholder={t("common.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("common.password")}</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className={primaryButtonClass}>
              {loading ? t("auth.login.submitting") : t("auth.login.submit")}
            </Button>
          </form>
          <div className="flex items-center gap-2 text-caption text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            {t("auth.login.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => setMode("code")}>
            {t("auth.login.useCode")}
          </Button>
        </>
      ) : (
        <form onSubmit={handleCodeRequest} className="space-y-sp-2">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input id="email" type="email" required autoComplete="email" placeholder={t("common.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? t("auth.code.sending") : t("auth.code.send")}
          </Button>
          <div className="text-center">
            <button type="button" className="text-body-sm text-accent hover:underline" onClick={() => setMode("password")}>
              {t("auth.login.usePassword")}
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
