import { EmptyState } from "@/components/EmptyState";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ErrorPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <EmptyState
          icon={AlertTriangle}
          title={t("error.title")}
          description={t("error.description")}
        />
        <Button asChild variant="outline" className="mt-sp-2">
          <Link to="/">{t("error.goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
