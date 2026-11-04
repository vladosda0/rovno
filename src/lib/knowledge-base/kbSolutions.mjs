// «Решения» of the knowledge base (docs-library slice 4, mockup v2 approved
// 22.10): cards like «Стены в санузле под плитку» with the person's case picked
// by condition toggles, steps, numbers, acceptance and a source chip per fact.
//
// Plain ESM shared by the SPA and the prerenderer (scripts/prerender-kb.mjs),
// so the in-app card, the guest page and the static HTML show the same items.
// The texts inside a card's body are content (Russian), not locale strings.
// Types live in kbSolutions.d.mts.

export const KB_SOLUTIONS_PATH = "/baza/resheniya/";

/**
 * Columns a guest may read (column grants, rovno-db 20261027040000), with the
 * facts and their documents embedded through the foreign keys. RLS serves only
 * published cards and only their facts.
 */
export const KB_SOLUTION_SELECT =
  "slug, title, body, checked_at, reviewed_at, updated_at, recheck_since, " +
  "kb_solution_facts(position, fact, doc_id, clause_anchor, quote, kb_documents(slug, designation))";

export function kbSolutionPath(slug) {
  return `${KB_SOLUTIONS_PATH}${slug}/`;
}

/** The body sections whose items are filtered by the chosen case. */
export const KB_SOLUTION_SECTIONS = ["steps", "numbers", "acceptance"];

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function positions(value) {
  return list(value).filter((n) => Number.isInteger(n));
}

// No choice ever carries this option, so an entry set to it never matches.
const NEVER = "\uFFFD";

/**
 * An item's case. An entry naming a key or option the card's conditions do not
 * have, or a non-string option, never matches: the item stays hidden in every
 * case rather than showing where it was not written for. Such entries go to
 * `ignored` so the card can report them.
 */
function when(value, options, ignored) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = Object.create(null);
  for (const [key, option] of Object.entries(value)) {
    const valid = typeof option === "string" && options.get(key)?.has(option);
    out[key] = valid ? option : NEVER;
    if (!valid) ignored.push(`${key}=${JSON.stringify(option)}`);
  }
  return Object.keys(out).length ? out : null;
}

function item(raw, ctx, textKey = "text") {
  const r = raw ?? {};
  return {
    text: text(r[textKey]) ?? "",
    facts: positions(r.facts),
    when: when(r.when, ctx.options, ctx.ignored),
    recommendation: r.recommendation === true,
  };
}

function normalizeConditions(raw) {
  return list(raw)
    .map((c) => ({
      key: text(c?.key) ?? "",
      label: text(c?.label) ?? "",
      options: list(c?.options)
        .map((o) => ({ key: text(o?.key) ?? "", label: text(o?.label) ?? "" }))
        .filter((o) => o.key && o.label),
    }))
    .filter((c) => c.key && c.options.length > 0);
}

function normalizeFact(raw) {
  const r = raw ?? {};
  const doc = r.kb_documents && typeof r.kb_documents === "object" ? r.kb_documents : null;
  return {
    position: Number(r.position),
    fact: text(r.fact) ?? "",
    docId: text(r.doc_id) ?? "",
    docSlug: text(doc?.slug),
    designation: text(doc?.designation),
    anchor: text(r.clause_anchor),
    quote: text(r.quote),
  };
}

const warned = new Set();

/** A kb_solutions row (with embedded facts) to the shape the UI reads. */
export function normalizeKbSolution(row) {
  const r = row ?? {};
  const body = r.body && typeof r.body === "object" ? r.body : {};
  const facts = list(r.kb_solution_facts)
    .map(normalizeFact)
    .filter((f) => Number.isInteger(f.position))
    .sort((a, b) => a.position - b.position);
  const slug = text(r.slug) ?? "";
  const conditions = normalizeConditions(body.conditions);
  const ctx = { options: new Map(conditions.map((c) => [c.key, new Set(c.options.map((o) => o.key))])), ignored: [] };
  const solution = {
    slug,
    title: text(r.title) ?? "",
    summary: text(body.summary),
    // The date the card was last checked against its sources: the review when
    // there was one, else the quote check.
    checkedAt: text(r.reviewed_at) ?? text(r.checked_at),
    // A document under the card changed (slice 7): «Проверяется» until the
    // pipeline publishes the card again.
    recheckSince: text(r.recheck_since),
    updatedAt: text(r.updated_at),
    conditions,
    steps: list(body.steps).map((s) => item(s, ctx)).filter((s) => s.text),
    numbers: list(body.numbers)
      .map((n) => ({ ...item(n, ctx, "what"), what: text(n?.what) ?? "", value: text(n?.value) ?? "" }))
      .filter((n) => n.what),
    acceptance: list(body.acceptance).map((a) => item(a, ctx)).filter((a) => a.text),
    divergences: list(body.divergences).map((d) => item(d, ctx)).filter((d) => d.text),
    facts,
  };
  const warning = `kb solution "${slug}": «when» entries outside its conditions hide their items: ${ctx.ignored.join(", ")}`;
  if (ctx.ignored.length && !warned.has(warning)) {
    warned.add(warning);
    console.warn(warning);
  }
  return solution;
}

/** Title order, so the folder and the sitemap list the same way every build. */
export function sortKbSolutions(solutions) {
  return [...solutions].sort((a, b) => a.title.localeCompare(b.title, "ru") || a.slug.localeCompare(b.slug));
}

/** The case every card opens on: the first option of each condition. */
export function kbDefaultChoice(solution) {
  return Object.fromEntries(solution.conditions.map((c) => [c.key, c.options[0].key]));
}

/** An item shows when every key of its `when` matches the chosen case. */
export function kbItemVisible(entry, choice) {
  if (!entry.when) return true;
  return Object.entries(entry.when).every(([key, option]) => choice?.[key] === option);
}

/** «СП 163.1325800» → «СП 163»: the chip drops the code after the number. */
export function kbShortDesignation(designation) {
  if (!designation) return "";
  return designation.replace(/^(.*?\s\d+)\.\d[\d.]*$/, "$1");
}

const APPENDIX_LETTERS = {
  a: "А", b: "Б", v: "В", g: "Г", d: "Д", e: "Е", zh: "Ж", z: "З", i: "И", k: "К", l: "Л", m: "М",
  n: "Н", p: "П", r: "Р", s: "С", t: "Т", u: "У", f: "Ф", h: "Х", kh: "Х", ts: "Ц", ch: "Ч", sh: "Ш",
  shch: "Щ", e2: "Э", yu: "Ю", ya: "Я",
};

/**
 * The clause part of a chip from its anchor: `p-6-4-2-8` → «п. 6.4.2.8»,
 * `p-pril-b` → «прил. Б», `p-pril-b-1` → «п. Б.1».
 */
export function kbClauseLabel(anchor) {
  if (!anchor) return null;
  const appendix = /^p-pril-([a-z0-9]+)(?:-(.+))?$/.exec(anchor);
  if (appendix) {
    const letter = APPENDIX_LETTERS[appendix[1]] ?? appendix[1].toUpperCase();
    return appendix[2] ? `п. ${letter}.${appendix[2].replace(/-/g, ".")}` : `прил. ${letter}`;
  }
  const clause = /^p-(.+)$/.exec(anchor);
  return clause ? `п. ${clause[1].replace(/-/g, ".")}` : null;
}

/**
 * The source chip of one cited fact: «СП 163, п. 6.4.2.8» on the chip, the full
 * designation and the verbatim quote in its window, and the document page with
 * the clause anchor behind «Открыть пункт в документе». kbItemChips merges the
 * chips of facts from the same clause into one that carries all their quotes.
 */
export function kbFactChip(fact) {
  const doc = fact.designation ?? fact.docId;
  const clause = kbClauseLabel(fact.anchor);
  return {
    key: `${fact.position}`,
    label: [kbShortDesignation(doc), clause].filter(Boolean).join(", "),
    heading: [doc, clause].filter(Boolean).join(" · "),
    quotes: fact.quote ? [fact.quote] : [],
    docSlug: fact.docSlug,
    anchor: fact.anchor,
  };
}

/**
 * The chips of an item, in the order of its fact positions: one per document
 * clause, its window listing the quote of every fact cited from that clause.
 */
export function kbItemChips(solution, entry) {
  const byPosition = new Map(solution.facts.map((f) => [f.position, f]));
  const byClause = new Map();
  for (const position of entry.facts) {
    const fact = byPosition.get(position);
    if (!fact) continue;
    const chip = kbFactChip(fact);
    const clauseKey = `${fact.docSlug ?? fact.docId}|${fact.anchor ?? ""}`;
    const same = byClause.get(clauseKey);
    if (same) {
      for (const quote of chip.quotes) if (!same.quotes.includes(quote)) same.quotes.push(quote);
    } else byClause.set(clauseKey, chip);
  }
  return [...byClause.values()];
}

/** «Документы: СП 163.1325800, СП 71.13330», in the order the facts cite them. */
export function kbSolutionDocuments(solution) {
  const out = [];
  for (const fact of solution.facts) {
    const name = fact.designation ?? fact.docId;
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

const MOSCOW_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A timestamptz as the Moscow calendar date «2026-10-28», or null. */
export function kbMoscowIsoDate(value) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(MOSCOW_DATE.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** «Проверено 28.10.2026»: reviewed_at / checked_at are timestamptz, shown on the Moscow date. */
export function kbSolutionCheckedDate(solution) {
  const iso = kbMoscowIsoDate(solution.checkedAt);
  return iso ? iso.split("-").reverse().join(".") : null;
}

/** Folder search: title, summary and every step, number, acceptance and fact text. */
export function kbSolutionMatches(solution, query) {
  const q = String(query ?? "").trim().toLocaleLowerCase("ru");
  if (!q) return true;
  const haystack = [
    solution.title,
    solution.summary,
    ...solution.steps.map((s) => s.text),
    ...solution.numbers.flatMap((n) => [n.what, n.value]),
    ...solution.acceptance.map((a) => a.text),
    ...solution.divergences.map((d) => d.text),
    ...solution.facts.map((f) => f.fact),
  ]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase("ru");
  return haystack.includes(q);
}
