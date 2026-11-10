import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { EmailCodeStep } from "@/components/auth/EmailCodeStep";
import { LegalConsent } from "@/components/auth/LegalConsent";
import { ExternalLoginButtons } from "@/components/auth/ExternalLoginButtons";
import { isJustConfirmed } from "@/lib/email-code";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearDemoSession, hasCompletedOnboarding, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { setAnalyticsUserId, trackEvent, trackEventOncePerUser } from "@/lib/analytics";
import { safeNextPath } from "@/lib/safe-next-path";

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const safeNext = safeNextPath(searchParams.get("next"));
  const postAuthDestination = safeNext ?? "/onboarding";

  // Funnel: "registration started" = the form was opened (captures the
  // never-submitted drop-off, not just failed submits).
  useEffect(() => {
    trackEvent("registration_start");
  }, []);

  // No password on sign-up (epic external-login, D7): the letter carries a code
  // and GoTrue creates the account. The marker tells «Безопасность» there is no
  // password yet; it is cosmetic and grants nothing. A taken address gets a
  // sign-in code to its existing account, so the screen never reveals it.
  const sendCode = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`,
        data: { full_name: name.trim(), passwordless: true },
      },
    });
    if (error) throw error;
  };

  const showFailure = (error: unknown) => {
    toast({
      title: t("auth.signup.failureTitle"),
      description: error instanceof Error ? error.message : t("auth.signup.genericFailure"),
      variant: "destructive",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast({ title: t("auth.signup.validationTitle"), description: t("auth.signup.validationAllRequired"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await sendCode();
      setCodeSent(true);
    } catch (error) {
      showFailure(error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = async (user: User) => {
    clearDemoSession();
    clearAiSidebarSessionPreference();
    setAuthRole("owner");
    setAnalyticsUserId(user.id);

    if (isJustConfirmed(user)) {
      // The code confirmed the email: the registration IS the first login.
      trackEventOncePerUser("registration_complete", {
        user_id: user.id,
        email_confirmation_required: false,
        method: "email_code",
      });
      trackEventOncePerUser("first_login", { user_id: user.id, via: "signup_autologin", method: "email_code" });
      toast({ title: t("auth.signup.successTitle"), description: t("auth.signup.welcomeToApp") });
      navigate(postAuthDestination);
      return;
    }

    const completedOnboarding = await hasCompletedOnboarding(user.id);
    toast({ title: t("auth.login.successTitle"), description: t("auth.login.successDescription") });
    navigate(safeNext ?? (completedOnboarding ? "/home" : "/onboarding"));
  };

  if (codeSent) {
    return (
      <EmailCodeStep
        email={email.trim()}
        onVerified={(session) => handleVerified(session.user)}
        onResend={async () => {
          try {
            await sendCode();
          } catch (error) {
            showFailure(error);
          }
        }}
        onChangeEmail={() => setCodeSent(false)}
      />
    );
  }

  return (
    <AuthCard
      title={t("auth.signup.title")}
      subtitle={t("auth.signup.subtitle")}
      footer={
        <p className="text-center text-body-sm text-muted-foreground">
          {t("auth.signup.alreadyHaveAccount")} <Link to={safeNext ? `/auth/login?next=${encodeURIComponent(safeNext)}` : "/auth/login"} className="text-accent hover:underline">{t("auth.signup.signIn")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("auth.signup.fullNameLabel")}</Label>
          <Input id="name" autoComplete="name" placeholder={t("auth.signup.fullNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("common.email")}</Label>
          <Input id="email" type="email" autoComplete="email" placeholder={t("common.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? t("auth.code.sending") : t("auth.signup.submit")}
        </Button>
      </form>
      <div className="flex items-center gap-2 text-caption text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {t("auth.login.or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <ExternalLoginButtons next={safeNext} />
      <LegalConsent i18nKey="auth.signup.consent" />
    </AuthCard>
  );
}
