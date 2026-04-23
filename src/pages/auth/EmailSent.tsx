import { useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";

export default function EmailSent() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";

  return (
    <AuthCard
      title={t("auth.emailSent.title")}
      subtitle={email ? t("auth.emailSent.subtitleWithEmail", { email }) : t("auth.emailSent.subtitle")}
      footer={
        <p className="text-caption text-muted-foreground text-center">
          {t("auth.emailSent.didntReceive")}{" "}
          <Link to="/auth/signup" className="text-accent hover:underline">
            {t("auth.emailSent.tryAgain")}
          </Link>
        </p>
      }
    >
      <div className="flex flex-col items-center gap-sp-3 py-sp-2">
        <Mail className="h-12 w-12 text-accent" />
        <p className="text-body text-muted-foreground text-center">
          {t("auth.emailSent.instructions")}
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/auth/login">{t("auth.emailSent.backToLogin")}</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
