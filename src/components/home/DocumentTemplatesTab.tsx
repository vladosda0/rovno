import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, IdCard, Download, Search, X } from "lucide-react";
import { MultiStepUploadModal } from "@/components/upload/MultiStepUploadModal";
import {
  DOCUMENT_BLANKS,
  DOCUMENT_BLANK_GROUPS,
  matchesTemplateQuery,
  type DocumentBlank,
} from "@/components/home/document-blanks";

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

interface BlankCardProps {
  blank: DocumentBlank;
  title: string;
  description: string;
}

function BlankCard({ blank, title, description }: BlankCardProps) {
  const { t } = useTranslation();
  const Icon = blank.format === "xlsx" ? FileSpreadsheet : FileText;
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <h5 className="flex-1 min-w-0 text-body font-medium text-foreground">{title}</h5>
        </div>
        <p className="text-caption text-muted-foreground">{description}</p>
        <p className="text-caption text-muted-foreground/80 italic">
          {t(`home.documentTemplates.blanks.source.${blank.source}`)}
        </p>
        <div className="mt-auto pt-1">
          <Button asChild variant="outline" size="sm">
            <a
              href={blank.href}
              download={blank.downloadName}
              aria-label={`${t(`home.documentTemplates.blanks.action.${blank.format}`)}: ${title}`}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              {t(`home.documentTemplates.blanks.action.${blank.format}`)}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DocumentTemplatesTab() {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [visitkaOpen, setVisitkaOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visitkaFields = [
    t("home.documentTemplates.pinned.visitka.fields.displayName"),
    t("home.documentTemplates.pinned.visitka.fields.contacts"),
    t("home.documentTemplates.pinned.visitka.fields.region"),
    t("home.documentTemplates.pinned.visitka.fields.specializations"),
    t("home.documentTemplates.pinned.visitka.fields.experience"),
    t("home.documentTemplates.pinned.visitka.fields.avatar"),
  ];

  const pinnedVisible = {
    catalog: matchesTemplateQuery(
      query,
      t("home.documentTemplates.pinned.catalog.title"),
      t("home.documentTemplates.pinned.catalog.description"),
    ),
    smeta: matchesTemplateQuery(
      query,
      t("home.documentTemplates.pinned.smeta.title"),
      t("home.documentTemplates.pinned.smeta.description"),
    ),
    visitka: matchesTemplateQuery(
      query,
      t("home.documentTemplates.pinned.visitka.title"),
      t("home.documentTemplates.pinned.visitka.description"),
    ),
  };
  const anyPinned = pinnedVisible.catalog || pinnedVisible.smeta || pinnedVisible.visitka;

  const blankGroups = useMemo(
    () =>
      DOCUMENT_BLANK_GROUPS.map((group) => ({
        group,
        blanks: DOCUMENT_BLANKS.filter((blank) => blank.group === group)
          .map((blank) => ({
            blank,
            title: t(`home.documentTemplates.blanks.items.${blank.id}.title`),
            description: t(`home.documentTemplates.blanks.items.${blank.id}.description`),
          }))
          .filter((item) => matchesTemplateQuery(query, item.title, item.description)),
      })).filter((entry) => entry.blanks.length > 0),
    [query, t],
  );
  const nothingFound = !anyPinned && blankGroups.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-h3 text-foreground">{t("home.documentTemplates.title")}</h2>
        <p className="text-caption text-muted-foreground mt-0.5">
          {t("home.documentTemplates.subtitle")}
        </p>
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("home.documentTemplates.search.placeholder")}
          aria-label={t("home.documentTemplates.search.placeholder")}
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("home.documentTemplates.search.clear")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {anyPinned && (
        <section aria-labelledby="rovno-pinned-heading" className="space-y-3">
          <h3 id="rovno-pinned-heading" className="text-body-sm font-medium text-foreground">
            {t("home.documentTemplates.pinned.heading")}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pinnedVisible.catalog && (
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
            )}

            {pinnedVisible.smeta && (
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
            )}

            {pinnedVisible.visitka && (
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
            )}
          </div>
        </section>
      )}

      {blankGroups.length > 0 && (
        <section aria-labelledby="document-blanks-heading" className="space-y-3">
          <div>
            <h3 id="document-blanks-heading" className="text-body-sm font-medium text-foreground">
              {t("home.documentTemplates.blanks.heading")}
            </h3>
            <p className="text-caption text-muted-foreground mt-0.5">
              {t("home.documentTemplates.blanks.description")}
            </p>
          </div>
          {blankGroups.map(({ group, blanks }) => (
            <div key={group} className="space-y-2">
              <h4 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                {t(`home.documentTemplates.blanks.groups.${group}`)}
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {blanks.map((item) => (
                  <BlankCard key={item.blank.id} {...item} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {nothingFound && (
        <Card>
          <CardContent className="py-8 text-center text-caption text-muted-foreground">
            {t("home.documentTemplates.search.empty", { query: query.trim() })}
          </CardContent>
        </Card>
      )}

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
