import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { supabase } from "@/integrations/supabase/client";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { clearWorkspaceUserCache } from "@/data/workspace-profile-cache";
import { clearDemoSession, hasCompletedOnboarding, setAuthRole } from "@/lib/auth-state";
import { setAnalyticsUserId, trackEvent, trackEventOncePerUser } from "@/lib/analytics";
import { isJustConfirmed } from "@/lib/email-code";
import { safeNextPath } from "@/lib/safe-next-path";
import { isSecondStepRequired, mfaPathFor } from "@/lib/mfa";

export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const safeNext = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    let cancelled = false;

    const finalize = async () => {
      let keptUser: User | null = null;
      try {
        // getSession() consumes the letter link and establishes the session.
        // Only the confirmation of a password account (old password sign-up) is
        // signed out so the user logs in explicitly; every other session (a code
        // account's sign-up button, the sign-in letter's button) stays signed in.
        //
        // Known caveat (accepted): email_verified fires on ANY session present at
        // /auth/callback, not strictly a genuine confirmation (the sign-in letter
        // from /auth/signup lands here too). It is a directional funnel signal.
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          trackEvent("email_verified", { user_id: data.session.user.id });
          const user = data.session.user;
          const passwordConfirmation = user.user_metadata?.passwordless !== true && isJustConfirmed(user);
          if (!passwordConfirmation) keptUser = user;
        }
      } catch {
        // ignore — we redirect regardless
      }

      if (cancelled) return;

      if (keptUser) {
        const userId = keptUser.id;
        clearDemoSession();
        clearAiSidebarSessionPreference();
        setAuthRole("owner");
        setAnalyticsUserId(userId);
        if (isJustConfirmed(keptUser)) {
          trackEventOncePerUser("registration_complete", {
            user_id: userId,
            email_confirmation_required: false,
            method: "email_code",
          });
          trackEventOncePerUser("first_login", { user_id: userId, via: "signup_letter_button", method: "email_code" });
        }
        // Two-factor protection (slice 4): the code from the app comes before anything is read.
        if (await isSecondStepRequired()) {
          if (cancelled) return;
          navigate(mfaPathFor(safeNext ?? "/home"), { replace: true });
          return;
        }
        const completedOnboarding = await hasCompletedOnboarding(userId);
        if (cancelled) return;
        navigate(safeNext ?? (completedOnboarding ? "/home" : "/onboarding"), { replace: true });
        return;
      }

      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — redirect regardless
      }

      if (cancelled) return;

      clearDemoSession();
      clearAiSidebarSessionPreference();
      clearWorkspaceUserCache();
      setAuthRole("guest");
      navigate("/auth/login?confirmed=1", { replace: true });
    };

    void finalize();

    return () => {
      cancelled = true;
    };
  }, [navigate, safeNext]);

  return (
    <AuthCard
      title={t("auth.callback.title")}
      subtitle={t("auth.callback.subtitle")}
    >
      <div className="flex items-center justify-center py-sp-3">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    </AuthCard>
  );
}
