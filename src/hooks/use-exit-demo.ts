import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { clearDemoSession, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { resetDemoState } from "@/data/store";
import { trackEvent } from "@/lib/analytics";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { toast } from "@/hooks/use-toast";

/**
 * Leave the demo showcase. The demo is a sandboxed mockup, not an account, so
 * exiting is not a logout: it drops the demo flag, re-seeds the demo store for
 * the next visitor of this tab, and returns the user to where they belong —
 * their real workspace when a Supabase session exists, the landing otherwise.
 */
export function useExitDemo() {
  const navigate = useNavigate();
  const { status } = useRuntimeAuth();
  const { t } = useTranslation();

  return useCallback(() => {
    const authed = status === "authenticated";
    clearDemoSession();
    resetDemoState();
    clearAiSidebarSessionPreference();
    // Mirror the post-auth role bookkeeping (Login/Signup do the same): the
    // simulated role only matters for demo/local stores, but leaving it as
    // "owner" would make legacy guards (e.g. isAuthenticated) misread a guest.
    setAuthRole(authed ? "owner" : "guest");
    trackEvent("demo_exited");
    toast({ title: t("demo.exitToast") });
    navigate(authed ? "/home" : "/");
  }, [navigate, status, t]);
}
