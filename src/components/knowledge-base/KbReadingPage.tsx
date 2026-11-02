// The in-app reading page (docs-library slice 2, frame 2, variant A): inside
// «Документы → База знаний», the left menu stays, «Назад» and the crumbs read as
// when entering a folder. The page has its own address
// (?docTab=knowledge-base&kbDoc=<slug>#p-…) to send to a colleague.

import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKbClauses, useKbDocument, useKbSpFullText } from "@/hooks/use-knowledge-base";
import { kbFullTextReadable } from "@/lib/knowledge-base/kbFullText.mjs";
import { kbHeading } from "@/lib/knowledge-base/kbConfig.mjs";
import { kbSourceButtons } from "./kb-view";
import { KbAskShurikButton, KbSelectionAsk } from "./KbAskShurik";
import { KbReader } from "./KbReader";

interface KbReadingPageProps {
  slug: string;
  onBack: () => void;
}

export function KbReadingPage({ slug, onBack }: KbReadingPageProps) {
  const { t } = useTranslation();
  const docQuery = useKbDocument(slug);
  const sp = useKbSpFullText();
  const doc = docQuery.data ?? null;
  const readable = !!doc && kbFullTextReadable(doc, sp.data);
  const clauses = useKbClauses(doc?.docId, readable);

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

  if (docQuery.isLoading || sp.isLoading) return status(t("home.knowledgeBase.reader.loading"));
  if (docQuery.isError) return status(t("home.knowledgeBase.loadError"));
  if (!doc) return status(t("home.knowledgeBase.public.notFoundBody"));
  // The switch is off or the text is gone: the page says so instead of an empty reader.
  if (!readable) return status(t("home.knowledgeBase.fullTextLater"));
  if (clauses.isLoading) return status(t("home.knowledgeBase.reader.loading"));
  if (clauses.isError || !clauses.data?.length) return status(t("home.knowledgeBase.reader.loadError"));

  const docLabel = doc.designation ?? doc.title;
  const clauseList = clauses.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <nav aria-label={t("home.knowledgeBase.title")} className="text-caption text-muted-foreground">
          {t("home.knowledgeBase.title")} › {t(`home.knowledgeBase.folders.${doc.folder}.title`)} ›{" "}
          <span className="text-foreground">{doc.designation ?? doc.title}</span>
        </nav>
      </div>
      <h1 className="text-h2 font-semibold text-foreground">{kbHeading(doc)}</h1>
      <KbSelectionAsk
        label={docLabel}
        within="section[id]"
        labelFor={(element) => {
          const anchor = element.closest("section[id]")?.id;
          const number = clauseList.find((clause) => clause.anchor === anchor)?.number;
          return number && /^\d/.test(number) ? `${docLabel}, ${t("ai.kb.sources.clausePrefix")} ${number}` : docLabel;
        }}
      >
        <KbReader
          doc={doc}
          clauses={clauseList}
          source={kbSourceButtons(doc, t)[0] ?? null}
          variant="app"
          headerExtra={<KbAskShurikButton label={docLabel} />}
        />
      </KbSelectionAsk>
    </div>
  );
}
