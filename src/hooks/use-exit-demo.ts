import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { clearDemoSession, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { trackEvent } from "@/lib/analytics";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { toast } from "@/hooks/use-toast";

/**
 * Leave the demo showcase. The demo is a sandboxed mockup, not an account, so
 * exiting is not a logout: it drops the demo flag and returns the user to
 * where they belong — their real workspace when a Supabase session exists,
 * the landing otherwise. The demo stores reset themselves on the flag drop
 * (see the pristine-re-entry listeners in store.ts / estimate-v2-store.ts).
 */
export function useExitDemo() {
  const navigate = useNavigate();
  const { status } = useRuntimeAuth();
  const { t } = useTranslation();

  return useCallback(() => {
    const authed = status === "authenticated";
    clearDemoSession();
    clearAiSidebarSessionPreference();
    // Mirror the post-auth role bookkeeping (Login/Signup do the same): the
    // simulated role only matters for demo/local stores, but leaving it as
    // "owner" would make legacy guards (e.g. isAuthenticated) misread a guest.
    // While the runtime session is still resolving ("loading") the truth is
    // unknown — leave the role alone rather than stamping "guest" next to a
    // live Supabase session (a real user would then get guest-gated UI).
    if (status !== "loading") {
      setAuthRole(authed ? "owner" : "guest");
    }
    trackEvent("demo_exited");
    toast({ title: t("demo.exitToast") });
    // With auth unresolved, land on the marketing page: its CTA resolves the
    // session itself and routes «В приложение» / «Начать проект» correctly.
    navigate(authed ? "/home" : "/");
  }, [navigate, status, t]);
}
