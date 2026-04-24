import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearDemoSession, hasCompletedOnboarding, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";

export default function AuthResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          setValidSession(true);
        } else {
          setValidSession(false);
          toast({
            title: t("auth.reset.errorTitle"),
            description: t("auth.reset.expiredLinkDescription"),
            variant: "destructive",
          });
          setTimeout(() => {
            navigate("/auth/forgot", { replace: true });
          }, 2000);
        }
      } catch (error) {
        setValidSession(false);
        toast({
          title: t("auth.reset.errorTitle"),
          description: error instanceof Error ? error.message : t("auth.reset.genericFailure"),
          variant: "destructive",
        });
        setTimeout(() => {
          navigate("/auth/forgot", { replace: true });
        }, 2000);
      } finally {
        setChecking(false);
      }
    };

    checkSession();
  }, [navigate, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !passwordConfirm) {
      toast({
        title: t("auth.reset.validationTitle"),
        description: t("auth.reset.validationAllRequired"),
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: t("auth.reset.validationTitle"),
        description: t("auth.reset.validationPasswordLength"),
        variant: "destructive",
      });
      return;
    }

    if (password !== passwordConfirm) {
      toast({
        title: t("auth.reset.validationTitle"),
        description: t("auth.reset.validationPasswordMismatch"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;

      clearDemoSession();
      clearAiSidebarSessionPreference();
      setAuthRole("owner");

      toast({
        title: t("auth.reset.successTitle"),
        description: t("auth.reset.successDescription"),
      });

      const destination = await hasCompletedOnboarding(userId) ? "/home" : "/onboarding";
      navigate(destination, { replace: true });
    } catch (error) {
      toast({
        title: t("auth.reset.failureTitle"),
        description: error instanceof Error ? error.message : t("auth.reset.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <AuthCard title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
        <div className="text-center py-sp-2">
          <p className="text-body-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </AuthCard>
    );
  }

  if (!validSession) {
    return (
      <AuthCard title={t("auth.reset.errorTitle")} subtitle={t("auth.reset.subtitle")}>
        <div className="text-center py-sp-2">
          <p className="text-body-sm text-muted-foreground">{t("auth.reset.expiredLinkDescription")}</p>
          <Button
            onClick={() => navigate("/auth/forgot", { replace: true })}
            className="w-full mt-sp-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("auth.reset.backToForgot")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
    >
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("common.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password-confirm">{t("auth.reset.confirmPasswordLabel")}</Label>
          <Input
            id="password-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? t("auth.reset.submitting") : t("auth.reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
