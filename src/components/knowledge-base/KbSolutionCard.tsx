// The body of a «Решения» card (docs-library slice 4, mockup v2 approved 22.10,
// frames 3-5 and 7). One view for the in-app page inside «Документы → База
// знаний» and for the guest page /baza/resheniya/<slug>/: the label and the
// documents line, the summary, the case toggles (frame 3, question 1), steps,
// numbers, acceptance, «где источники расходятся», a source chip with the quote
// window on every item (frame 4, question 2) and the check line (frame 5).
//
// Every case stays in the DOM: an item outside the chosen case is only hidden,
// so a guest from search and a crawler see the whole card (frame 6).

import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  kbDefaultChoice,
  kbItemChips,
  kbItemVisible,
  kbSolutionCheckedDate,
  kbSolutionDocuments,
  type KbFactChip,
  type KbSolution,
  type KbSolutionChoice,
  type KbSolutionItem,
} from "@/lib/knowledge-base/kbSolutions.mjs";
import { KbLabelBadge } from "./KbTextLabel";

interface KbSolutionCardProps {
  solution: KbSolution;
  /** Where «Открыть пункт в документе» leads: the in-app reading page or the guest document page. */
  clauseHref: (chip: KbFactChip) => string | null;
  /** Rendered under the label line (the guest page's «Спросить Шурика»). */
  headerExtra?: React.ReactNode;
}

const CHOICE_KEY = (slug: string) => `rovno:kb-solution-choice:${slug}`;

/** The chosen case for this visit (sessionStorage); a stale or foreign value falls back to the default. */
function readChoice(solution: KbSolution): KbSolutionChoice {
  const fallback = kbDefaultChoice(solution);
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(CHOICE_KEY(solution.slug)) ?? "null") as unknown;
    if (!stored || typeof stored !== "object") return fallback;
    const out = { ...fallback };
    for (const c of solution.conditions) {
      const value = (stored as Record<string, unknown>)[c.key];
      if (typeof value === "string" && c.options.some((o) => o.key === value)) out[c.key] = value;
    }
    return out;
  } catch {
    return fallback;
  }
}

function saveChoice(slug: string, choice: KbSolutionChoice) {
  try {
    window.sessionStorage.setItem(CHOICE_KEY(slug), JSON.stringify(choice));
  } catch {
    // Private mode or blocked storage: the choice lives until the page closes.
  }
}

function SourceChip({ chip, href }: { chip: KbFactChip; href: string | null }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground transition hover:bg-accent/10 hover:text-accent"
        >
          {chip.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <p className="text-caption font-semibold text-foreground">{chip.heading}</p>
        {chip.quotes.map((quote) => (
          <blockquote key={quote} className="text-body-sm text-muted-foreground">
            «…{quote}…»
          </blockquote>
        ))}
        {href && (
          <Link to={href} className="inline-block text-body-sm text-accent hover:underline">
            {t("home.knowledgeBase.solutions.openClause")}
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function KbSolutionCard({ solution, clauseHref, headerExtra }: KbSolutionCardProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [choice, setChoiceState] = useState<KbSolutionChoice>(() => readChoice(solution));
  const checked = kbSolutionCheckedDate(solution);
  const documents = kbSolutionDocuments(solution);

  function choose(condition: string, option: string) {
    // Radix single toggle groups send "" when the pressed item is pressed again: keep a case chosen.
    if (!option) return;
    const next = { ...choice, [condition]: option };
    setChoiceState(next);
    saveChoice(solution.slug, next);
  }

  const chips = (entry: KbSolutionItem) =>
    kbItemChips(solution, entry).map((chip) => <SourceChip key={chip.key} chip={chip} href={clauseHref(chip)} />);

  const recommendation = (entry: KbSolutionItem) =>
    entry.recommendation ? (
      <span className="text-muted-foreground"> {t("home.knowledgeBase.solutions.recommendation")}</span>
    ) : null;

  const textItem = (entry: KbSolutionItem, index: number) => (
    <li key={index} hidden={!kbItemVisible(entry, choice)} data-kb-item>
      <span>{entry.text}</span>
      {recommendation(entry)} <span className="inline-flex flex-wrap gap-1 align-middle">{chips(entry)}</span>
    </li>
  );

  const section = (title: string, children: React.ReactNode) => (
    <section className="space-y-2">
      <h2 className="text-h3 font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );

  return (
    <div className="space-y-5" data-kb-solution={solution.slug}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {checked && <KbLabelBadge kind="verified" text={t("home.knowledgeBase.checkedOn", { date: checked })} />}
        {documents.length > 0 && (
          <span>{t("home.knowledgeBase.solutions.documents", { list: documents.join(", ") })}</span>
        )}
      </div>
      {headerExtra}
      {solution.summary && <p className="text-body text-foreground">{solution.summary}</p>}

      {solution.conditions.length > 0 && (
        <div className="space-y-3 rounded-card border border-border bg-muted/30 p-4">
          {solution.conditions.map((c) => (
            <div key={c.key} className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
              <span id={`kb-cond-${c.key}`} className="text-body-sm font-medium text-foreground md:w-32 md:shrink-0">
                {c.label}
              </span>
              {isMobile ? (
                // Frame 7: on a narrow screen the toggles become dropdowns, like the section picker in «Документы».
                <Select value={choice[c.key]} onValueChange={(value) => choose(c.key, value)}>
                  <SelectTrigger aria-labelledby={`kb-cond-${c.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {c.options.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={choice[c.key]}
                  onValueChange={(value) => choose(c.key, value)}
                  aria-labelledby={`kb-cond-${c.key}`}
                  className="flex-wrap justify-start"
                >
                  {c.options.map((o) => (
                    <ToggleGroupItem
                      key={o.key}
                      value={o.key}
                      className="data-[state=on]:border-accent data-[state=on]:bg-accent/10 data-[state=on]:text-accent"
                    >
                      {o.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>
          ))}
        </div>
      )}

      {solution.steps.length > 0 &&
        section(
          t("home.knowledgeBase.solutions.steps"),
          <ol className="list-decimal space-y-2 pl-5 text-body text-foreground">{solution.steps.map(textItem)}</ol>,
        )}

      {solution.divergences.length > 0 &&
        section(
          t("home.knowledgeBase.solutions.divergences"),
          <ul className="list-disc space-y-2 pl-5 text-body text-foreground">{solution.divergences.map(textItem)}</ul>,
        )}

      {solution.numbers.length > 0 &&
        section(
          t("home.knowledgeBase.solutions.numbers"),
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("home.knowledgeBase.solutions.numbersWhat")}</TableHead>
                <TableHead>{t("home.knowledgeBase.solutions.numbersValue")}</TableHead>
                <TableHead>{t("home.knowledgeBase.solutions.numbersSource")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {solution.numbers.map((n, index) => (
                <TableRow key={index} hidden={!kbItemVisible(n, choice)} data-kb-item>
                  <TableCell>
                    {n.what}
                    {recommendation(n)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{n.value}</TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap gap-1">{chips(n)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>,
        )}

      {solution.acceptance.length > 0 &&
        section(
          t("home.knowledgeBase.solutions.acceptance"),
          // A reminder, not a form: the boxes are drawn and nothing is saved (frame 3).
          <ul className="space-y-2 text-body text-foreground [&>li]:relative [&>li]:pl-6 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-1 [&>li]:before:h-3.5 [&>li]:before:w-3.5 [&>li]:before:rounded-sm [&>li]:before:border [&>li]:before:border-border [&>li]:before:content-['']">
            {solution.acceptance.map(textItem)}
          </ul>,
        )}

      <footer className="space-y-1 border-t border-border pt-4 text-caption text-muted-foreground">
        {checked && <p>{t("home.knowledgeBase.solutions.checkedWithSources", { date: checked })}</p>}
        <p>{t("home.knowledgeBase.solutions.disclaimer")}</p>
      </footer>
    </div>
  );
}
