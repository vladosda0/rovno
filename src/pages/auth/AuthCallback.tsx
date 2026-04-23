import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { supabase } from "@/integrations/supabase/client";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";
import { clearDemoSession, setAuthRole } from "@/lib/auth-state";

export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finalize = async () => {
      try {
        await supabase.auth.getSession();
      } catch {
        // ignore — we redirect regardless
      }

      if (cancelled) return;

      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — redirect regardless
      }

      if (cancelled) return;

      clearDemoSession();
      clearAiSidebarSessionPreference();
      setAuthRole("guest");
      navigate("/auth/login?confirmed=1", { replace: true });
    };

    void finalize();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
