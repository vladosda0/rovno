import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, IdCard, Download } from "lucide-react";
import { MultiStepUploadModal } from "@/components/upload/MultiStepUploadModal";

const CATALOG_TEMPLATE_HREF = "/templates/rovno-catalog-template.xlsx";
const ESTIMATE_TEMPLATE_HREF = "/templates/rovno-estimate-template.csv";

interface PinnedCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
  body?: React.ReactNode;
}

function PinnedCard({ icon, title, description, action, body }: PinnedCardProps) {
  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent/15 p-2 text-accent">{icon}</div>
          <div className="flex-1 min-w-0">
            <h4 className="text-body font-medium text-foreground">{title}</h4>
          </div>
        </div>
        <p className="text-caption text-muted-foreground whitespace-pre-wrap">{description}</p>
        {body}
        <div className="mt-auto pt-1">{action}</div>
      </CardContent>
    </Card>
  );
}

export function DocumentTemplatesTab() {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [visitkaOpen, setVisitkaOpen] = useState(false);

  const visitkaFields = [
    t("home.documentTemplates.pinned.visitka.fields.displayName"),
    t("home.documentTemplates.pinned.visitka.fields.contacts"),
    t("home.documentTemplates.pinned.visitka.fields.region"),
    t("home.documentTemplates.pinned.visitka.fields.specializations"),
    t("home.documentTemplates.pinned.visitka.fields.experience"),
    t("home.documentTemplates.pinned.visitka.fields.avatar"),
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-h3 text-foreground">{t("home.documentTemplates.title")}</h2>
        <p className="text-caption text-muted-foreground mt-0.5">
          {t("home.documentTemplates.subtitle")}
        </p>
      </div>

      <section aria-labelledby="rovno-pinned-heading" className="space-y-3">
        <h3 id="rovno-pinned-heading" className="text-body-sm font-medium text-foreground">
          {t("home.documentTemplates.pinned.heading")}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PinnedCard
            icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />}
            title={t("home.documentTemplates.pinned.catalog.title")}
            description={t("home.documentTemplates.pinned.catalog.description")}
            action={(
              <Button asChild variant="default" size="sm">
                <a href={CATALOG_TEMPLATE_HREF} download>
                  <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {t("home.documentTemplates.pinned.catalog.action")}
                </a>
              </Button>
            )}
          />

          <PinnedCard
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title={t("home.documentTemplates.pinned.smeta.title")}
            description={t("home.documentTemplates.pinned.smeta.description")}
            action={(
              <Button asChild variant="default" size="sm">
                <a href={ESTIMATE_TEMPLATE_HREF} download>
                  <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {t("home.documentTemplates.pinned.smeta.action")}
                </a>
              </Button>
            )}
          />

          <PinnedCard
            icon={<IdCard className="h-5 w-5" aria-hidden="true" />}
            title={t("home.documentTemplates.pinned.visitka.title")}
            description={t("home.documentTemplates.pinned.visitka.description")}
            body={(
              <ul className="list-disc pl-5 text-caption text-muted-foreground space-y-0.5">
                {visitkaFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            )}
            action={(
              <Button variant="default" size="sm" onClick={() => setVisitkaOpen(true)}>
                {t("home.documentTemplates.pinned.visitka.action")}
              </Button>
            )}
          />
        </div>
      </section>

      <section aria-labelledby="other-templates-heading" className="space-y-3">
        <h3 id="other-templates-heading" className="text-body-sm font-medium text-foreground">
          {t("home.documentTemplates.other.heading")}
        </h3>
        <Card>
          <CardContent className="py-8 text-center text-caption text-muted-foreground">
            {t("home.documentTemplates.other.empty")}
          </CardContent>
        </Card>
      </section>

      <MultiStepUploadModal
        open={visitkaOpen}
        onOpenChange={setVisitkaOpen}
        presetType="visitka"
        onComplete={() => {
          // Show the saved card under the org contractor-card leaf.
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", "documents");
            next.set("docTab", "org-contractor-card");
            return next;
          });
        }}
      />
    </div>
  );
}
