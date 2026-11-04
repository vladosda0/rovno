// The open knowledge-base document in the «Документы» left menu (docs-library
// slice 7, frame 1, mockup v6 approved 03.11): «Своды правил › СП … › sections
// › Приложения» as a cascade under «База знаний», instead of a contents column
// next to the text. A section jumps to its anchor through the address hash,
// which the reader follows. The phone keeps the reader's own dropdown.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FileText, Folder } from "lucide-react";
import { useKbClauses, useKbDocument, useKbSpFullText } from "@/hooks/use-knowledge-base";
import { kbAnchorFromHash, kbFullTextReadable, kbSectionAnchor, kbToc, type KbTocEntry } from "@/lib/knowledge-base/kbFullText.mjs";
import { kbHeading } from "@/lib/knowledge-base/kbConfig.mjs";
import { cn } from "@/lib/utils";

interface KbNavContentsProps {
  slug: string;
  /** Back to the document's folder in «База знаний». */
  onFolder: () => void;
}

const row = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm transition-colors";

export function KbNavContents({ slug, onFolder }: KbNavContentsProps) {
  const { t } = useTranslation();
  const doc = useKbDocument(slug).data ?? null;
  const sp = useKbSpFullText();
  const readable = !!doc && kbFullTextReadable(doc, sp.data);
  const clausesData = useKbClauses(doc?.docId, readable).data;
  const clauses = useMemo(() => clausesData ?? [], [clausesData]);
  const toc = useMemo(() => kbToc(clauses), [clauses]);
  const [anchor, setAnchor] = useState<string | null>(() =>
    typeof window === "undefined" ? null : kbAnchorFromHash(window.location.hash),
  );
  const [backOpen, setBackOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setAnchor(kbAnchorFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!doc) return null;
  const section = anchor && clauses.length ? kbSectionAnchor(clauses, anchor) : null;

  const entry = (e: KbTocEntry) => (
    <button
      key={e.anchor}
      type="button"
      onClick={() => {
        // The same hash fires no hashchange: scroll to it directly.
        if (kbAnchorFromHash(window.location.hash) === e.anchor) {
          document.getElementById(e.anchor)?.scrollIntoView({ block: "start", behavior: "smooth" });
        } else {
          window.location.hash = e.anchor;
        }
      }}
      aria-current={e.anchor === section ? "location" : undefined}
      className={cn(
        row,
        "py-1 pl-[3.25rem] text-caption",
        e.level > 1 && "pl-[4.25rem]",
        e.anchor === section ? "bg-accent/10 font-medium text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      data-kb-nav-section
    >
      <span className="line-clamp-2">{e.label}</span>
    </button>
  );

  return (
    <div className="space-y-0.5" data-kb-nav>
      <button type="button" onClick={onFolder} className={cn(row, "pl-7 text-muted-foreground hover:bg-muted hover:text-foreground")}>
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t(`home.knowledgeBase.folders.${doc.folder}.title`)}</span>
      </button>
      <div className={cn(row, "pl-10 font-medium text-accent")} aria-current="page">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="line-clamp-2">{kbHeading(doc)}</span>
      </div>
      {toc.main.filter((e) => e.level === 1).map(entry)}
      {toc.back.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setBackOpen((v) => !v)}
            className={cn(row, "py-1 pl-[3.25rem] text-caption text-muted-foreground hover:bg-muted hover:text-foreground")}
            aria-expanded={backOpen}
          >
            <span className="truncate">{t("home.knowledgeBase.reader.appendices")}</span>
            <ChevronDown className={cn("ml-auto h-3 w-3 transition-transform", !backOpen && "-rotate-90")} />
          </button>
          {backOpen && toc.back.map((e) => entry({ ...e, level: 2 }))}
        </>
      )}
    </div>
  );
}
