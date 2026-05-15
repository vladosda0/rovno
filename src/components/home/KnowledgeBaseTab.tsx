import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export function KnowledgeBaseTab() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-muted p-4 text-muted-foreground">
          <BookOpen className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-h3 text-foreground">{t("home.knowledgeBase.title")}</h2>
        <p className="max-w-prose text-body-sm text-muted-foreground">
          {t("home.knowledgeBase.subtitle")}
        </p>
        <p className="max-w-prose text-caption text-muted-foreground">
          {t("home.knowledgeBase.empty.body")}
        </p>
      </CardContent>
    </Card>
  );
}
