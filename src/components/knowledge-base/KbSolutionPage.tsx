// The in-app page of a «Решения» card (docs-library slice 4, frame 3): built
// like the reading page of slice 2 (KbReadingPage) inside «Документы → База
// знаний», with «Назад», the crumbs «База знаний › Решения › <title>» and its
// own address (?docTab=knowledge-base&kbSolution=<slug>). A source chip opens
// the reading page on the clause; «Назад» there comes back to the card.

import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { kbKeys, useKbSolution } from "@/hooks/use-knowledge-base";
import type { KbFactChip, KbSolution } from "@/lib/knowledge-base/kbSolutions.mjs";
import { KbSolutionCard } from "./KbSolutionCard";

/** The reading page's parameter (KnowledgeBaseTab.KB_READ_PARAM), repeated to avoid an import cycle. */
const READ_PARAM = "kbDoc";

interface KbSolutionPageProps {
  slug: string;
  onBack: () => void;
}

export function KbSolutionPage({ slug, onBack }: KbSolutionPageProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  // Opened from the folder: the card is already in the list read, no second fetch.
  const cached = queryClient.getQueryData<KbSolution[]>(kbKeys.solutions())?.find((s) => s.slug === slug);
  const query = useKbSolution(slug, cached, queryClient.getQueryState(kbKeys.solutions())?.dataUpdatedAt);
  const solution = query.data ?? null;

  function clauseHref(chip: KbFactChip): string | null {
    if (!chip.docSlug) return null;
    const next = new URLSearchParams(searchParams);
    next.set(READ_PARAM, chip.docSlug);
    return `?${next.toString()}${chip.anchor ? `#${chip.anchor}` : ""}`;
  }

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack}>
      <ChevronLeft className="mr-1 h-3.5 w-3.5" />
      {t("home.documentsHub.folders.backToAll")}
    </Button>
  );

  const status = (text: string) => (
    <div className="space-y-3">
      {back}
      <p className="text-body-sm text-muted-foreground">{text}</p>
    </div>
  );

  if (query.isLoading) return status(t("home.knowledgeBase.solutions.loading"));
  if (query.isError) return status(t("home.knowledgeBase.loadError"));
  if (!solution) return status(t("home.knowledgeBase.public.notFoundBody"));

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <nav aria-label={t("home.knowledgeBase.title")} className="text-caption text-muted-foreground">
          {t("home.knowledgeBase.title")} › {t("home.knowledgeBase.solutions.title")} ›{" "}
          <span className="text-foreground">{solution.title}</span>
        </nav>
      </div>
      <h1 className="text-h2 font-semibold text-foreground">{solution.title}</h1>
      <KbSolutionCard solution={solution} clauseHref={clauseHref} />
    </div>
  );
}
