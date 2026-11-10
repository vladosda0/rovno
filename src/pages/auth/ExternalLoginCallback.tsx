import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { ExternalAccountProof } from "@/components/auth/ExternalAccountProof";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { setAnalyticsUserId, trackEventOncePerUser } from "@/lib/analytics";
import { clearDemoSession, hasCompletedOnboarding, setAuthRole } from "@/lib/auth-state";
import { isJustConfirmed } from "@/lib/email-code";
import { safeNextPath } from "@/lib/safe-next-path";
import {
  confirmExternalProof,
  finishExternalCallback,
  takeStartedAttempt,
  type ExternalMode,
  type ExternalProof,
  type ExternalResult,
  type LoginProvider,
} from "@/lib/external-login";

type SignedInResult = Extract<ExternalResult, { outcome: "verify" | "session" }>;
type SettingsNotice = "linked" | "taken" | "has_yandex" | "has_vk" | "failed";

// Only the two types the functions mint; anything else is not spent.
async function signInWith(result: SignedInResult): Promise<User | null> {
  if (result.outcome === "session") {
    const { data, error } = await supabase.auth.setSession(result.session);
    return error ? null : data.user;
  }
  const { token_hash, type } = result.verify ?? {};
  if (typeof token_hash !== "string" || !token_hash || (type !== "signup" && type !== "magiclink")) return null;
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  return error || !data.session ? null : data.user;
}

const TITLE: Record<LoginProvider, string> = { yandex: "auth.yandex.callbackTitle", vk: "auth.vk.callbackTitle" };
const HAS_OWN: Record<LoginProvider, string> = { yandex: "security.connected.hasYandex", vk: "security.connected.hasVk" };
const FAILED: Record<LoginProvider, string> = { yandex: "auth.yandex.failed", vk: "auth.vk.failed" };

/**
 * The page Yandex ID and VK ID return to (epic external-login, slices 2-3): finishes the
 * attempt this browser started, signs in, shows the proof screens, or brings a link
 * result back to Security.
 */
export default function ExternalLoginCallback({ provider }: { provider: LoginProvider }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [proof, setProof] = useState<ExternalProof | null>(null);
  const startedNext = useRef<string | null>(null);
  const handled = useRef(false);

  const settingsPath = (notice: SettingsNotice) => `/settings?tab=security&${provider}=${notice}`;

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
        method: provider,
      });
      trackEventOncePerUser("first_login", { user_id: user.id, via: provider, method: provider });
      toast({ title: t("auth.signup.successTitle"), description: t("auth.signup.welcomeToApp") });
      navigate(safeNext ?? "/onboarding", { replace: true });
      return;
    }

    const completedOnboarding = await hasCompletedOnboarding(user.id);
    if (!completedOnboarding) {
      trackEventOncePerUser("first_login", { user_id: user.id, via: "login", method: provider });
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
    const deviceId = searchParams.get("device_id");
    const attempt = takeStartedAttempt(provider, state);
    startedNext.current = attempt?.next ?? null;
    window.history.replaceState(window.history.state, "", window.location.pathname);

    const fail = (mode: ExternalMode, next: string | null) => {
      if (mode === "link") {
        navigate(settingsPath("failed"), { replace: true });
        return;
      }
      const safeNext = safeNextPath(next);
      navigate(`/auth/login?${provider}=failed${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`, { replace: true });
    };

    // VK ID returns a device id with the code, and its exchange cannot go without it.
    if (!attempt || !code || !state || (provider === "vk" && !deviceId)) {
      fail(attempt?.mode ?? "login", attempt?.next ?? null);
      return;
    }

    void (async () => {
      const result = await finishExternalCallback(provider, { code, state, deviceId }).catch(() => ({ outcome: "failed" as const }));

      if (attempt.mode === "link") {
        if (result.outcome === "linked") navigate(settingsPath("linked"), { replace: true });
        else if (result.outcome === "taken") navigate(settingsPath("taken"), { replace: true });
        else if (result.outcome === "has_yandex" || result.outcome === "has_vk") navigate(settingsPath(result.outcome), { replace: true });
        else fail("link", null);
        return;
      }

      if (result.outcome === "proof") {
        setProof(result);
        return;
      }

      if (result.outcome !== "verify" && result.outcome !== "session") {
        fail("login", attempt.next);
        return;
      }

      const user = await signInWith(result).catch(() => null);
      if (!user) {
        fail("login", attempt.next);
        return;
      }
      await finishSignIn(user, result.created, result.next ?? attempt.next);
    })();
    // finishSignIn closes over stable helpers; this runs once per callback URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proofNext = proof?.next ?? startedNext.current;

  const handleProven = async (user: User) => {
    if (!proof) return;
    const result = await confirmExternalProof(provider, proof.token).catch(() => ({ outcome: "failed" as const }));
    // The sign-in itself succeeded, only the link did not: the person goes in and the
    // screen comes back next time.
    if (result.outcome === "has_yandex" || result.outcome === "has_vk") {
      toast({ title: t(HAS_OWN[provider]), variant: "destructive" });
    } else if (result.outcome !== "linked") {
      toast({ title: t(FAILED[provider]), variant: "destructive" });
    }
    // A typed address is new when the code just confirmed it; an existing account's
    // address was confirmed long before.
    const created = proof.kind === "new_email" || (proof.kind === "need_email" && isJustConfirmed(user));
    await finishSignIn(user, created, proofNext);
  };

  const handleCancel = () => {
    const safeNext = safeNextPath(proofNext);
    navigate(`/auth/login${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`, { replace: true });
  };

  if (proof) {
    return (
      <ExternalAccountProof
        provider={provider}
        proof={proof}
        next={proofNext}
        onProven={handleProven}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <AuthCard title={t(TITLE[provider])} subtitle={t("auth.callback.subtitle")}>
      <div className="flex items-center justify-center py-sp-3">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    </AuthCard>
  );
}
