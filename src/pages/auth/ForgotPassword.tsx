import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: t("auth.forgot.validationTitle"), description: t("auth.forgot.validationDescription"), variant: "destructive" });
      return;
    }
    setSent(true);
    toast({ title: t("auth.forgot.sentTitle"), description: t("auth.forgot.sentDescription") });
  };

  return (
    <AuthCard
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={
        <p className="text-center text-body-sm">
          <Link to="/auth/login" className="text-accent hover:underline">{t("auth.forgot.backToLogin")}</Link>
        </p>
      }
    >
      {sent ? (
        <div className="text-center py-sp-2">
          <p className="text-body-sm text-foreground">{t("auth.forgot.sentTo")} <strong>{email}</strong></p>
          <p className="text-caption text-muted-foreground mt-1">{t("auth.forgot.sentInstructions")}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-sp-2">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input id="email" type="email" placeholder={t("common.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
