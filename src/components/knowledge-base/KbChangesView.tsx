// «Документы → База знаний → Что изменилось» (docs-library 8.4, mockup v3
// frames 2, 3, 7): what the weekly check found, by month, newest first. The left
// menu carries the path from md up; the phone keeps «Назад».

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronLeft } from "lucide-react";
import type { To } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SectionChrome } from "@/components/home/documents-hub/SectionChrome";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";
import { useKbChanges } from "@/hooks/use-knowledge-base";
import { kbChangeMonths } from "@/lib/knowledge-base/kbChanges.mjs";
import { markFeatureOpened } from "@/lib/new-features";
import { KbChangesList } from "./KbChangesList";

export const KB_CHANGES_FEATURE = "kb-changes";

interface KbChangesViewProps {
  onBack: () => void;
  docTo: (slug: string) => To;
  solutionTo: (slug: string) => To;
}

export function KbChangesView({ onBack, docTo, solutionTo }: KbChangesViewProps) {
  const { t, i18n } = useTranslation();
  const feed = useKbChanges();
  const months = useMemo(
    () => kbChangeMonths(feed.data ?? [], (key, vars) => t(key, vars) as string, i18n.language),
    [feed.data, t, i18n.language],
  );

  useEffect(() => {
    markFeatureOpened(KB_CHANGES_FEATURE);
  }, []);

  return (
    <SectionChrome
      title={t("home.knowledgeBase.changes.title")}
      subtitle={t("home.knowledgeBase.changes.subtitle")}
      search=""
      onSearchChange={() => {}}
      pageSize={1}
      page={0}
      onPageChange={() => {}}
      totalAfterFilter={0}
      isFilterActive={false}
      onReset={() => {}}
      toolbarHidden
      headerExtra={
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          {t("home.documentsHub.folders.backToAll")}
        </Button>
      }
    >
      {feed.isLoading ? (
        <p className="text-body-sm text-muted-foreground">{t("home.knowledgeBase.changes.loading")}</p>
      ) : feed.isError ? (
        <EmptyState icon={BookOpen} title={t("home.knowledgeBase.changes.title")} body={t("home.knowledgeBase.loadError")} />
      ) : months.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-7 text-center text-body-sm text-muted-foreground">
          {t("home.knowledgeBase.changes.empty")}
        </p>
      ) : (
        <KbChangesList months={months} docTo={docTo} solutionTo={solutionTo} />
      )}
    </SectionChrome>
  );
}
