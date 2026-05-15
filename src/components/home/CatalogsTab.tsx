import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";

export function CatalogsTab() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-muted p-4 text-muted-foreground">
          <Package className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-h3 text-foreground">{t("home.catalogs.title")}</h2>
        <p className="max-w-prose text-body-sm text-muted-foreground">
          {t("home.catalogs.subtitle")}
        </p>
        <p className="max-w-prose text-caption text-muted-foreground">
          {t("home.catalogs.empty.body")}
        </p>
      </CardContent>
    </Card>
  );
}
