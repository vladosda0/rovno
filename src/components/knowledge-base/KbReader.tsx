// Reading a knowledge-base document in full (docs-library slice 2, mockup v2
// approved 20.10, label v2 approved 21.10). One reader for the in-app page
// inside «Документы» (frame 2, variant A) and for the guest page /baza/<slug>/
// (frame 6): header with the label and the edition line, the source button,
// the «recognised from a scan» line (frame 8), the «not in force» plate
// (frame 5), the contents, search in the document (frame 2a) and the clauses
// with their own link (frame 3) and the «Пункт изменён» note (frame 4).

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ExternalLink, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { KbClause, KbDocument } from "@/lib/knowledge-base/api";
import { useKbDocumentById } from "@/hooks/use-knowledge-base";
import { kbDocPath, kbHeading } from "@/lib/knowledge-base/kbConfig.mjs";
import {
  kbAnchorFromHash,
  kbClauseUrl,
  kbEditionLine,
  kbHighlight,
  kbSearchMatches,
  kbSectionAnchor,
  kbTextLabel,
  kbToc,
  type KbTocEntry,
} from "@/lib/knowledge-base/kbFullText.mjs";
import { formatKbDate } from "@/lib/knowledge-base/kbConfig.mjs";
import { KbTextLabel } from "./KbTextLabel";
import type { KbSourceButton } from "./kb-view";

interface KbReaderProps {
  doc: KbDocument;
  clauses: KbClause[];
  /** First source button (official first), as in the document window. */
  source: KbSourceButton | null;
  /** "app": contents on the left from md up; "guest": contents as a dropdown, like the phone. */
  variant: "app" | "guest";
  /** Rendered between the header and the text (the guest page's «Спросить Шурика»). */
  headerExtra?: React.ReactNode;
}

function scrollToAnchor(anchor: string) {
  const el = document.getElementById(anchor);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: "smooth" });
}

export function KbReader({ doc, clauses, source, variant, headerExtra }: KbReaderProps) {
  const { t } = useTranslation();
  const tr = (key: string, vars?: Record<string, unknown>) => t(key, vars) as string;
  const label = kbTextLabel(doc, tr);
  const edition = kbEditionLine(doc, tr);
  const editionShort = kbEditionLine(doc, tr, { short: true });
  const toc = useMemo(() => kbToc(clauses), [clauses]);
  const replacement = useKbDocumentById(doc.docStatus !== "active" ? doc.replacedBy : null);

  const [target, setTarget] = useState<string | null>(() =>
    typeof window === "undefined" ? null : kbAnchorFromHash(window.location.hash),
  );
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const matches = useMemo(() => kbSearchMatches(clauses, query), [clauses, query]);
  const activeMatch = matches.length ? matches[Math.min(current, matches.length - 1)] : null;
  const highlighted = activeMatch?.anchor ?? target;
  const section = highlighted ? kbSectionAnchor(clauses, highlighted) : null;
  const sectionEntry = toc.main.find((e) => e.anchor === section) ?? null;

  // A link with #p-… opens the page on that clause (frame 3). The hash can change
  // without a reload (a link inside the app), so listen as well.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!target || scrolledFor.current === target || clauses.length === 0) return;
    scrolledFor.current = target;
    scrollToAnchor(target);
  }, [target, clauses.length]);
  useEffect(() => {
    const onHash = () => setTarget(kbAnchorFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => setCurrent(0), [query]);
  useEffect(() => {
    if (activeMatch) scrollToAnchor(activeMatch.anchor);
  }, [activeMatch]);

  function go(anchor: string) {
    setTarget(anchor);
    scrolledFor.current = anchor;
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", `#${anchor}`);
    scrollToAnchor(anchor);
  }

  async function copyLink(anchor: string) {
    const url = kbClauseUrl(window.location.origin, doc.slug, anchor);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("home.knowledgeBase.reader.copied") });
    } catch {
      window.prompt(t("home.knowledgeBase.reader.copyLink"), url);
    }
  }

  const matchIndex = new Map<string, Array<{ start: number; end: number; index: number; field: string }>>();
  matches.forEach((m, index) => {
    const key = `${m.anchor}:${m.field}`;
    const list = matchIndex.get(key) ?? [];
    list.push({ start: m.start, end: m.end, index, field: m.field });
    matchIndex.set(key, list);
  });
  const currentIndex = activeMatch ? matches.indexOf(activeMatch) : -1;

  function renderText(text: string, anchor: string, field: "heading" | "body") {
    const own = matchIndex.get(`${anchor}:${field}`) ?? [];
    if (!own.length) return text;
    return kbHighlight(text, own, currentIndex).map((piece, i) =>
      piece.hit ? (
        <mark key={i} className={cn("rounded-sm px-0.5", piece.current ? "bg-accent/40" : "bg-accent/15")}>
          {piece.text}
        </mark>
      ) : (
        <span key={i}>{piece.text}</span>
      ),
    );
  }

  const tocList = (entries: KbTocEntry[], onPick?: () => void) =>
    entries.map((entry) => (
      <button
        key={entry.anchor}
        type="button"
        onClick={() => {
          go(entry.anchor);
          onPick?.();
        }}
        className={cn(
          "block w-full rounded-md px-2 py-1.5 text-left text-body-sm transition hover:bg-muted",
          entry.level > 1 && "pl-5 text-muted-foreground",
          entry.anchor === section && "bg-accent/10 font-medium text-foreground",
        )}
      >
        {entry.label}
      </button>
    ));

  const [tocOpen, setTocOpen] = useState(false);
  const tocDropdown = (
    <Collapsible open={tocOpen} onOpenChange={setTocOpen} className="rounded-panel border border-border">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-body-sm font-medium">
          <span className="truncate">
            {sectionEntry
              ? t("home.knowledgeBase.reader.tocCurrent", { section: sectionEntry.label })
              : t("home.knowledgeBase.reader.toc")}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition", tocOpen && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="max-h-80 overflow-y-auto border-t border-border p-1">
        {tocList(toc.main, () => setTocOpen(false))}
        {toc.back.length > 0 && (
          <>
            <p className="px-2 pt-2 text-caption text-muted-foreground">{t("home.knowledgeBase.reader.appendices")}</p>
            {tocList(toc.back, () => setTocOpen(false))}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );

  const searchBar = (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("home.knowledgeBase.reader.search")}
          aria-label={t("home.knowledgeBase.reader.search")}
          className="pl-8"
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches.length) {
              e.preventDefault();
              setCurrent((c) => (c + (e.shiftKey ? matches.length - 1 : 1)) % matches.length);
            }
          }}
        />
      </div>
      {query.trim().length >= 2 && (
        <>
          <span className="whitespace-nowrap text-caption text-muted-foreground" aria-live="polite">
            {t("home.knowledgeBase.reader.searchCount", {
              current: matches.length ? currentIndex + 1 : 0,
              total: matches.length,
            })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!matches.length}
            aria-label={t("home.knowledgeBase.reader.prevMatch")}
            onClick={() => setCurrent((c) => (c + matches.length - 1) % matches.length)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!matches.length}
            aria-label={t("home.knowledgeBase.reader.nextMatch")}
            onClick={() => setCurrent((c) => (c + 1) % matches.length)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );

  const since = formatKbDate(doc.docStatusSince);

  return (
    <div className="space-y-4">
      {doc.docStatus !== "active" && (
        <div className="rounded-panel border border-destructive/30 bg-destructive/10 px-4 py-3 text-body-sm text-destructive">
          {since ? t("home.knowledgeBase.reader.inactiveSince", { date: since }) : t("home.knowledgeBase.reader.inactive")}
          {replacement.data && (
            <>
              {" "}
              {t("home.knowledgeBase.reader.replacedBy")}{" "}
              <a className="font-medium underline" href={kbDocPath(replacement.data.slug)}>
                {kbHeading(replacement.data)}
              </a>
            </>
          )}
        </div>
      )}

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {label && <KbTextLabel doc={doc} kind={label.kind} text={label.text} />}
          {edition && (
            <span className="text-body-sm text-muted-foreground">
              <span className="hidden sm:inline">{edition}</span>
              <span className="sm:hidden">{editionShort ?? edition}</span>
            </span>
          )}
        </div>
        {doc.recognizedFromScan && (
          <p className="text-caption text-muted-foreground">
            {t(
              doc.textLabel === "verified"
                ? "home.knowledgeBase.reader.scannedVerified"
                : "home.knowledgeBase.reader.scannedChecking",
            )}{" "}
            {doc.textPdfUrl ? (
              <a className="text-accent hover:underline" href={doc.textPdfUrl} target="_blank" rel="noopener noreferrer">
                {t("home.knowledgeBase.reader.scannedLink")}
              </a>
            ) : (
              t("home.knowledgeBase.reader.scannedLink")
            )}
            .
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {source && (
            <Button asChild variant="outline" size="sm">
              <a href={source.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                {source.label}
              </a>
            </Button>
          )}
          {headerExtra}
        </div>
      </header>

      <div className={cn(variant === "app" && "md:grid md:grid-cols-[15rem_1fr] md:gap-6")}>
        {variant === "app" && (
          <nav aria-label={t("home.knowledgeBase.reader.toc")} className="hidden md:block">
            <div className="sticky top-4 max-h-[calc(100vh-6rem)] space-y-0.5 overflow-y-auto">
              <p className="px-2 pb-1 text-caption font-semibold text-muted-foreground">{t("home.knowledgeBase.reader.toc")}</p>
              {tocList(toc.main)}
              {toc.back.length > 0 && (
                <>
                  <p className="px-2 pt-3 pb-1 text-caption font-semibold text-muted-foreground">
                    {t("home.knowledgeBase.reader.appendices")}
                  </p>
                  {tocList(toc.back)}
                </>
              )}
            </div>
          </nav>
        )}

        <div className="min-w-0 space-y-3">
          <div className={cn(variant === "app" && "md:hidden")}>{tocDropdown}</div>
          {searchBar}
          <div className="space-y-2">
            {clauses.map((c) => {
              const isTarget = c.anchor === highlighted;
              const isSection = c.level === 1 || !c.number || !/^\d/.test(c.number);
              if (c.heading && !c.body) {
                const Tag = isSection ? "h2" : "h3";
                return (
                  <Tag
                    key={c.anchor}
                    id={c.anchor}
                    className={cn(
                      "scroll-mt-20 pt-4 font-semibold text-foreground",
                      isSection ? "text-h3" : "text-body",
                      isTarget && "border-l-2 border-accent pl-2",
                    )}
                  >
                    {c.number && /^\d/.test(c.number) ? `${c.number} ` : ""}
                    {renderText(c.heading, c.anchor, "heading")}
                  </Tag>
                );
              }
              return (
                <section
                  key={c.anchor}
                  id={c.anchor}
                  className={cn(
                    "group scroll-mt-20 rounded-md py-1",
                    isTarget && "border-l-2 border-accent bg-accent/5 pl-2",
                  )}
                >
                  {c.heading && (
                    <p className={cn("font-semibold text-foreground", isSection ? "pt-4 text-h3" : "text-body")}>
                      {c.number && /^\d/.test(c.number) ? `${c.number} ` : ""}
                      {renderText(c.heading, c.anchor, "heading")}
                    </p>
                  )}
                  <p className="overflow-x-auto text-body-sm leading-relaxed text-foreground">
                    {!c.heading && c.number && (
                      <button
                        type="button"
                        onClick={() => void copyLink(c.anchor)}
                        title={t("home.knowledgeBase.reader.copyLink")}
                        aria-label={`${c.number}. ${t("home.knowledgeBase.reader.copyLink")}`}
                        className="mr-1.5 inline-flex items-center gap-0.5 font-semibold text-foreground hover:text-accent"
                      >
                        {c.number}
                        <Link2 className="h-3 w-3 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                      </button>
                    )}
                    {renderText(c.body, c.anchor, "body")}
                  </p>
                  {c.amendments.length > 0 && (
                    <p className="mt-1 text-caption text-muted-foreground">
                      {t("home.knowledgeBase.reader.amended", { no: c.amendments[c.amendments.length - 1] })}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
