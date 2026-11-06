// The lines of «Что изменилось» (docs-library 8.4, mockup v3 frames 2, 5, 7):
// a month heading, then one card per line, the date on the left (above it on a
// phone), the document as a link, what happened, and a grey second line only
// when there is something to add. The same list in the app and on /baza/izmeneniya/.

import { Link, type To } from "react-router-dom";
import type { KbChangeMonth, KbChangePart } from "@/lib/knowledge-base/kbChanges.mjs";

interface KbChangesListProps {
  months: KbChangeMonth[];
  docTo: (slug: string) => To;
  solutionTo: (slug: string) => To;
  /** 3 under the app's section title, 2 under the guest page's h1. */
  headingLevel?: 2 | 3;
}

export function KbChangesList({ months, docTo, solutionTo, headingLevel = 3 }: KbChangesListProps) {
  const MonthHeading = headingLevel === 2 ? "h2" : "h3";
  const part = (p: KbChangePart, i: number) => {
    const to = p.doc ? docTo(p.doc) : p.solution ? solutionTo(p.solution) : null;
    return to ? (
      <Link key={i} to={to} className="text-accent hover:underline">
        {p.text}
      </Link>
    ) : (
      <span key={i}>{p.text}</span>
    );
  };

  return (
    <div className="space-y-2">
      {months.map((month) => (
        <section key={month.key} className="space-y-2">
          <MonthHeading className="pt-1.5 text-body-sm font-semibold text-muted-foreground">{month.label}</MonthHeading>
          {month.entries.map((entry) => (
            <div
              key={entry.key}
              data-testid="kb-change"
              className="grid grid-cols-1 gap-x-3 gap-y-1 rounded-card border border-border bg-card px-3.5 py-2.5 text-body-sm sm:grid-cols-[6rem_minmax(0,1fr)]"
            >
              <span className="text-muted-foreground" data-kb-change-date>{entry.date}</span>
              <div className="flex min-w-0 flex-col gap-0.5 break-words">
                <span className="text-foreground">{entry.parts.map(part)}</span>
                {entry.note && <span className="text-caption text-muted-foreground">{entry.note}</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
