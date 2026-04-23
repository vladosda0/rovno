import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearDemoSession, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nextUrl = searchParams.get("next");
  const postAuthDestination = nextUrl && nextUrl.startsWith("/") ? nextUrl : "/onboarding";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast({ title: t("auth.signup.validationTitle"), description: t("auth.signup.validationAllRequired"), variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: t("auth.signup.validationTitle"), description: t("auth.signup.validationPasswordLength"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: name.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      clearDemoSession();
      clearAiSidebarSessionPreference();
      if (data.session?.user) {
        setAuthRole("owner");
        toast({ title: t("auth.signup.successTitle"), description: t("auth.signup.welcomeToApp") });
        navigate(postAuthDestination);
        return;
      }

      navigate(`/auth/email-sent?email=${encodeURIComponent(email.trim())}`);
    } catch (error) {
      toast({
        title: t("auth.signup.failureTitle"),
        description: error instanceof Error ? error.message : t("auth.signup.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t("auth.signup.title")}
      subtitle={t("auth.signup.subtitle")}
      footer={
        <p className="text-center text-body-sm text-muted-foreground">
          {t("auth.signup.alreadyHaveAccount")} <Link to="/auth/login" className="text-accent hover:underline">{t("auth.signup.signIn")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("auth.signup.fullNameLabel")}</Label>
          <Input id="name" placeholder={t("auth.signup.fullNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("common.email")}</Label>
          <Input id="email" type="email" placeholder={t("common.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("common.password")}</Label>
          <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? t("auth.signup.submitting") : t("auth.signup.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
