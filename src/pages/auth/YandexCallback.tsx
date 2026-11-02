import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { YandexAccountProof } from "@/components/auth/YandexAccountProof";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { setAnalyticsUserId, trackEventOncePerUser } from "@/lib/analytics";
import { clearDemoSession, hasCompletedOnboarding, setAuthRole } from "@/lib/auth-state";
import { safeNextPath } from "@/lib/safe-next-path";
import {
  confirmYandexProof,
  finishYandexCallback,
  takeStartedAttempt,
  type YandexMode,
  type YandexProof,
} from "@/lib/yandex-login";

function settingsPath(notice: "linked" | "taken" | "has_yandex" | "failed"): string {
  return `/settings?tab=security&yandex=${notice}`;
}

export default function YandexCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [proof, setProof] = useState<YandexProof | null>(null);
  const startedNext = useRef<string | null>(null);
  const handled = useRef(false);

  const finishSignIn = async (user: User, created: boolean, next: string | null) => {
    const safeNext = safeNextPath(next);
    clearDemoSession();
    clearAiSidebarSessionPreference();
    setAuthRole("owner");
    setAnalyticsUserId(user.id);

    if (created) {
      trackEventOncePerUser("registration_complete", {
        user_id: user.id,
        email_confirmation_required: false,
        method: "yandex",
      });
      trackEventOncePerUser("first_login", { user_id: user.id, via: "yandex", method: "yandex" });
      toast({ title: t("auth.signup.successTitle"), description: t("auth.signup.welcomeToApp") });
      navigate(safeNext ?? "/onboarding", { replace: true });
      return;
    }

    const completedOnboarding = await hasCompletedOnboarding(user.id);
    if (!completedOnboarding) {
      trackEventOncePerUser("first_login", { user_id: user.id, via: "login", method: "yandex" });
    }
    toast({ title: t("auth.login.successTitle"), description: t("auth.login.successDescription") });
    navigate(safeNext ?? (completedOnboarding ? "/home" : "/onboarding"), { replace: true });
  };

  useEffect(() => {
    // The code is single use: a second effect run must not spend it again.
    if (handled.current) return;
    handled.current = true;

    const state = searchParams.get("state");
    const code = searchParams.get("code");
    const attempt = takeStartedAttempt(state);
    startedNext.current = attempt?.next ?? null;
    window.history.replaceState(window.history.state, "", window.location.pathname);

    const fail = (mode: YandexMode, next: string | null) => {
      if (mode === "link") {
        navigate(settingsPath("failed"), { replace: true });
        return;
      }
      const safeNext = safeNextPath(next);
      navigate(`/auth/login?yandex=failed${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`, { replace: true });
    };

    if (!attempt || !code || !state) {
      fail(attempt?.mode ?? "login", attempt?.next ?? null);
      return;
    }

    void (async () => {
      const result = await finishYandexCallback(code, state).catch(() => ({ outcome: "failed" as const }));

      if (attempt.mode === "link") {
        if (result.outcome === "linked") navigate(settingsPath("linked"), { replace: true });
        else if (result.outcome === "taken") navigate(settingsPath("taken"), { replace: true });
        else if (result.outcome === "has_yandex") navigate(settingsPath("has_yandex"), { replace: true });
        else fail("link", null);
        return;
      }

      if (result.outcome === "proof") {
        setProof(result);
        return;
      }

      if (result.outcome !== "session") {
        fail("login", attempt.next);
        return;
      }

      const { data, error } = await supabase.auth.setSession(result.session);
      if (error || !data.user) {
        fail("login", attempt.next);
        return;
      }
      await finishSignIn(data.user, result.created, result.next ?? attempt.next);
    })();
    // finishSignIn closes over stable helpers; this runs once per callback URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proofNext = proof?.next ?? startedNext.current;

  const handleProven = async (user: User) => {
    if (!proof) return;
    const result = await confirmYandexProof(proof.token).catch(() => ({ outcome: "failed" as const }));
    // The sign-in itself succeeded, only the link did not: the person goes in and the
    // screen comes back next time.
    if (result.outcome === "has_yandex") {
      toast({ title: t("security.connected.hasYandex"), variant: "destructive" });
    } else if (result.outcome !== "linked") {
      toast({ title: t("auth.yandex.failed"), variant: "destructive" });
    }
    await finishSignIn(user, proof.kind === "new_email", proofNext);
  };

  const handleCancel = () => {
    const safeNext = safeNextPath(proofNext);
    navigate(`/auth/login${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`, { replace: true });
  };

  if (proof) {
    return (
      <YandexAccountProof
        proof={proof}
        next={proofNext}
        onProven={handleProven}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <AuthCard title={t("auth.yandex.callbackTitle")} subtitle={t("auth.callback.subtitle")}>
      <div className="flex items-center justify-center py-sp-3">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    </AuthCard>
  );
}
