// Knowledge-base line under a Shurik answer (docs-library slice 5, steps 5.6-5.7;
// mockup docs-library-s5.html, frames 2-5). Collapsed: «Опираюсь на: <first
// clause> и ещё N»; open: the solution card, then every clause with the yellow
// «проверяется» note. A clause opens a popover with its verbatim text, «Открыть
// пункт в документе» (new tab on desktop) and «Спросить про этот пункт», which
// puts the quote into this project's composer. No base entry: «Общие
// рекомендации: в базе знаний этого пока нет» on the same spot.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import type { KbAnswerSource, LiveTextKnowledgeBase } from "@/lib/ai-assistant-contract";
import { kbMoscowToday } from "@/lib/knowledge-base/kbHistory.mjs";
import { kbLawClauseLabel } from "@/lib/knowledge-base/kbFullText.mjs";

const KB_TAB = "/home?tab=documents&docTab=knowledge-base";

export function kbClauseHref(source: KbAnswerSource): string | null {
  if (!source.docSlug) return null;
  const hash = source.anchor ? `#${encodeURIComponent(source.anchor)}` : "";
  return `${KB_TAB}&kbDoc=${encodeURIComponent(source.docSlug)}${hash}`;
}

export function kbSolutionHref(slug: string): string {
  return `${KB_TAB}&kbSolution=${encodeURIComponent(slug)}`;
}

/** [1,2,3,4,7] -> "1–4, 7" */
export function compactAmendmentNumbers(numbers: ReadonlyArray<number>): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const n of [...sorted, Number.NaN]) {
    if (prev !== null && n === prev + 1) {
      prev = n;
      continue;
    }
    if (start !== null && prev !== null) parts.push(prev > start ? `${start}–${prev}` : `${start}`);
    start = n;
    prev = n;
  }
  return parts.join(", ");
}

export function kbClauseLabel(source: KbAnswerSource, clausePrefix = "п."): string {
  // A law part reads «ст. 51 ч. 17», or «ст. 39.1 п. 1» in a law split into points (docs-library 9.2в).
  const law = kbLawClauseLabel(source.anchor);
  if (law) return `${source.docLabel}, ${law}`;
  if (!source.clause) return source.docLabel;
  // «Приложение Ж» names itself, the prefix goes only before a clause number.
  return /^\d/.test(source.clause)
    ? `${source.docLabel}, ${clausePrefix} ${source.clause}`
    : `${source.docLabel}, ${source.clause}`;
}

/** «· с 01.06.2027 пункт меняется (Изменение № 5)» for the nearest approved amendment (docs-library 7.4). */
function useUpcomingNote() {
  const { t } = useTranslation();
  return (source: KbAnswerSource): string | null => {
    const today = kbMoscowToday();
    const next = [...(source.upcomingAmendments ?? [])]
      .filter((a) => a.effectiveFrom > today)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    if (!next) return null;
    const [y, m, d] = next.effectiveFrom.split("-");
    return t("ai.kb.sources.upcoming", { date: `${d}.${m}.${y}`, no: next.no });
  };
}

function useCheckingNote() {
  const { t } = useTranslation();
  return (source: KbAnswerSource): string | null => {
    if (!source.checking) return null;
    if (source.pendingAmendments.length === 0) return t("ai.kb.sources.checking");
    return t("ai.kb.sources.checkingPending", {
      count: new Set(source.pendingAmendments).size,
      numbers: compactAmendmentNumbers(source.pendingAmendments),
    });
  };
}

interface ClauseButtonProps {
  source: KbAnswerSource;
  onAsk?: (text: string) => void;
}

function ClauseButton({ source, onAsk }: ClauseButtonProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const href = kbClauseHref(source);
  const prefix = t("ai.kb.sources.clausePrefix");
  const label = kbClauseLabel(source, prefix);
  // The window heading names what the button names: «ТК РФ · ст. 81» for a law article that has no clause number.
  const heading = label !== source.docLabel ? `${source.docLabel} · ${label.slice(source.docLabel.length + 2)}` : source.docLabel;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-left text-accent hover:underline break-words">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side={isMobile ? "bottom" : "top"} className="w-80 max-w-[calc(100vw-2rem)] space-y-2">
        <p className="text-caption font-semibold text-foreground">{heading}</p>
        {source.quote ? (
          <blockquote className="text-body-sm text-muted-foreground break-words">«…{source.quote}{source.quote.endsWith("…") ? "" : "…"}»</blockquote>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {href ? (
            <a
              href={href}
              target={isMobile ? undefined : "_blank"}
              rel={isMobile ? undefined : "noopener noreferrer"}
              className="text-body-sm text-accent hover:underline"
            >
              {t("home.knowledgeBase.solutions.openClause")}
            </a>
          ) : null}
          {onAsk ? (
            <button
              type="button"
              className="text-body-sm text-accent hover:underline"
              onClick={() => {
                const quote = source.quote ? `«${source.quote}» · ` : "";
                onAsk(`${quote}${label}\n`);
                setOpen(false);
              }}
            >
              {t("ai.kb.sources.askAboutClause")}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface KbSourceLineProps {
  knowledgeBase: LiveTextKnowledgeBase;
  /** Puts text into this project's composer (step 5.7). */
  onAskAboutClause?: (text: string) => void;
}

export function KbSourceLine({ knowledgeBase, onAskAboutClause }: KbSourceLineProps) {
  const { t } = useTranslation();
  const checkingNote = useCheckingNote();
  const upcomingNote = useUpcomingNote();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { sources } = knowledgeBase;

  if (sources.length === 0) {
    if (!knowledgeBase.missing) return null;
    return (
      <p className="mt-2 flex items-start gap-1.5 text-caption text-muted-foreground" data-testid="kb-missing">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        <span>{t("ai.kb.missing")}</span>
      </p>
    );
  }

  const cards: { slug: string; title: string }[] = [];
  for (const s of sources) {
    if (s.solutionSlug && !cards.some((c) => c.slug === s.solutionSlug)) {
      cards.push({ slug: s.solutionSlug, title: s.solutionTitle ?? s.solutionSlug });
    }
  }
  const total = cards.length + sources.length;
  const first = sources[0];

  const fallback = knowledgeBase.fallbackCountry ? (
    <p className="mt-2 text-caption text-muted-foreground break-words" data-testid="kb-country-fallback">
      {t("ai.kb.sources.countryFallback", { country: t(`preferences.kbCountry.genitive.${knowledgeBase.fallbackCountry}`) })}
    </p>
  ) : null;

  return (
    <>
    {fallback}
    <Collapsible open={open} onOpenChange={setOpen} className={`${fallback ? "mt-1" : "mt-2"} min-w-0 max-w-full text-caption`} data-testid="kb-sources">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full min-w-0 items-start gap-1.5 rounded-sm text-left text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 flex-1 break-words">
            {t("ai.kb.sources.lead")} {kbClauseLabel(first, t("ai.kb.sources.clausePrefix"))}
            {total > 1 ? ` ${t("ai.kb.sources.more", { count: total - 1 })}` : ""}
          </span>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 opacity-80 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-1 pl-5">
          {cards.map((c) => (
            <li key={`card-${c.slug}`} className="break-words">
              <a
                href={kbSolutionHref(c.slug)}
                target={isMobile ? undefined : "_blank"}
                rel={isMobile ? undefined : "noopener noreferrer"}
                className="text-accent hover:underline"
              >
                {t("ai.kb.sources.solution", { title: c.title })}
              </a>
            </li>
          ))}
          {sources.map((s, i) => {
            const note = checkingNote(s);
            const upcoming = upcomingNote(s);
            return (
              <li key={`${s.docId}-${s.anchor ?? i}`} className="break-words">
                <ClauseButton source={s} onAsk={onAskAboutClause} />
                {note ? <span className="ml-1 text-[hsl(38_70%_38%)] dark:text-[hsl(42_80%_65%)]">{note}</span> : null}
                {upcoming ? <span className="ml-1" data-kb-upcoming>{upcoming}</span> : null}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
    </>
  );
}
