// Full text of a knowledge-base document (epic docs-library, slice 2).
//
// Plain ESM shared by the SPA and the build-time prerenderer, like kbConfig.mjs:
// the reading page, the label and the edition line read the same in the app,
// on the public /baza/<slug>/ page and in its static HTML. Approved views:
// rovno-docs/audit/mockups/docs-library-s2.html (v2, 20.10) and
// docs-library-label.html (v2, 21.10). Types live in kbFullText.d.mts.

import { normalizeUpcomingAmendments } from "./kbHistory.mjs";

// kbConfig.mjs imports this module (normalizeKbRow), so the date helper is not
// imported back from there.
function formatKbDate(value) {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}.${match[2]}.${match[1]}` : null;
}

function intList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpUrlOrNull(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** The slice-2 columns of a kb_documents row, normalised. */
export function normalizeKbFullTextFields(row) {
  const r = row ?? {};
  const status = r.doc_status === "replaced" || r.doc_status === "cancelled" ? r.doc_status : "active";
  const pending = Array.isArray(r.pending_amendments) ? r.pending_amendments : [];
  return {
    docStatus: status,
    docStatusSince: stringOrNull(r.doc_status_since),
    replacedBy: stringOrNull(r.replaced_by),
    editionDate: stringOrNull(r.edition_date),
    textCheckedAt: stringOrNull(r.text_checked_at),
    textSourceUrl: httpUrlOrNull(r.text_source_url),
    textPdfUrl: httpUrlOrNull(r.text_pdf_url),
    textLabel: r.text_label === "verified" ? "verified" : r.text_label === "checking" ? "checking" : null,
    textBaseYear: Number.isInteger(r.text_base_year) ? r.text_base_year : null,
    appliedAmendments: intList(r.applied_amendments),
    pendingAmendments: pending
      .filter((p) => p && Number.isInteger(Number(p.no)))
      .map((p) => ({ no: Number(p.no), url: httpUrlOrNull(p.url) }))
      .sort((a, b) => a.no - b.no),
    recognizedFromScan: r.recognized_from_scan === true,
    upcomingAmendments: normalizeUpcomingAmendments(r.upcoming_amendments),
  };
}

/** A kb_clauses row to the reading-page shape. */
export function normalizeKbClause(row) {
  const r = row ?? {};
  const level = Number(r.level);
  return {
    anchor: String(r.anchor ?? ""),
    number: stringOrNull(r.number),
    level: Number.isInteger(level) && level > 0 ? level : 1,
    heading: stringOrNull(r.heading),
    body: typeof r.body === "string" ? r.body : "",
    position: Number(r.position) || 0,
    amendments: intList(r.amendments),
  };
}

/**
 * Whether the full text is shown. The SP switch (R-10) hides it for the «sp»
 * folder only; RLS returns no clauses then anyway, this keeps the button and
 * the page honest about it.
 */
export function kbFullTextReadable(doc, spFullTextEnabled) {
  if (!doc?.fullTextAvailable) return false;
  return doc.folder !== "sp" || spFullTextEnabled !== false;
}

/** «1-4» for a run of three or more, else «1, 2»; «1, 2, 4, 5». */
export function amendmentList(numbers) {
  const sorted = [...new Set(intList(numbers))].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${sorted[i]}-${sorted[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join(", ");
}

/**
 * The label: green «Проверено <date>» or yellow «Проверяется» on the same spot
 * (label v2), red «Не действует» for a replaced or cancelled document (slice 2,
 * frame 5). Null when the document has no full text.
 */
export function kbTextLabel(doc, t) {
  if (!doc?.fullTextAvailable || !doc.textLabel) return null;
  if (doc.docStatus !== "active") return { kind: "inactive", text: t("home.knowledgeBase.label.inactive") };
  if (doc.textLabel === "verified") {
    return { kind: "verified", text: t("home.knowledgeBase.checkedOn", { date: formatKbDate(doc.textCheckedAt) ?? "" }) };
  }
  return { kind: "checking", text: t("home.knowledgeBase.label.checking") };
}

/**
 * «Редакция от 03.10.2025, с изменениями № 1-4» for a verified text, «Текст
 * 2017 года, без изменений № 1-4» for one still being checked (`short`: «Текст
 * 2017 года», the phone header).
 */
export function kbEditionLine(doc, t, { short = false } = {}) {
  if (!doc?.fullTextAvailable) return null;
  if (doc.textLabel === "verified") {
    const date = formatKbDate(doc.editionDate);
    if (!date) return null;
    return doc.appliedAmendments.length
      ? t("home.knowledgeBase.edition.withAmendments", { date, list: amendmentList(doc.appliedAmendments) })
      : t("home.knowledgeBase.edition.dated", { date });
  }
  const pending = doc.pendingAmendments.map((p) => p.no);
  if (doc.textBaseYear) {
    if (short || !pending.length) return t("home.knowledgeBase.edition.textYear", { year: doc.textBaseYear });
    return t("home.knowledgeBase.edition.textYearWithout", { year: doc.textBaseYear, list: amendmentList(pending) });
  }
  return pending.length && !short ? t("home.knowledgeBase.edition.textWithout", { list: amendmentList(pending) }) : null;
}

/** The window under the yellow label: amendments with a link, and those not found. */
export function kbPendingAmendmentsView(doc) {
  const linked = doc.pendingAmendments.filter((p) => p.url);
  const missing = doc.pendingAmendments.filter((p) => !p.url).map((p) => p.no);
  return { linked, missing, missingList: amendmentList(missing) };
}

/** A law's chapter (`gl-6`, `rz-ii`, code part `cz-2`) or article (`st-51`) and its parts (slice 9). */
export function kbIsLawAnchor(anchor) {
  return /^(?:gl|rz|cz|st)-/.test(String(anchor ?? ""));
}

/**
 * Table of contents: sections, their headed subsections, appendices last. A
 * law (slice 9, frame 1 A): chapters at level 1, their articles at level 2.
 */
export function kbToc(clauses) {
  const main = [];
  const back = [];
  for (const c of clauses) {
    if (kbIsLawAnchor(c.anchor)) {
      if (c.heading && c.level <= 2) main.push({ anchor: c.anchor, label: c.heading, level: c.level });
      continue;
    }
    const isBack = !c.number || !/^\d/.test(c.number);
    if (isBack) {
      back.push({ anchor: c.anchor, label: c.heading ?? c.number ?? "", level: 1 });
      continue;
    }
    if (!c.heading) continue;
    if (c.level > 2) continue;
    main.push({ anchor: c.anchor, label: `${c.number} ${c.heading}`, level: c.level });
  }
  return { main, back };
}

/** The section a clause belongs to (its level-1 ancestor), for the TOC highlight. */
export function kbSectionAnchor(clauses, anchor) {
  let section = null;
  for (const c of clauses) {
    if (c.level === 1) section = c.anchor;
    if (c.anchor === anchor) return section ?? c.anchor;
  }
  return null;
}

const SUPERSCRIPT = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const sup = (digits) => [...digits].map((d) => SUPERSCRIPT[Number(d)]).join("");

/**
 * «ст. 51 ч. 17» from a law anchor (slice 9, frame 4), the same rule as the
 * server's source line: `st-51s1` is article 51¹, `st-55s5s1` article 55⁵⁻¹, `st-51-1` article 51.1,
 * `-ch-1-1` part 1¹, `-ch-7-1-1` part 7¹⁻¹. Null for any other anchor.
 */
export function kbLawClauseLabel(anchor) {
  const m = anchor ? /^st-(\d+(?:-\d+)*)((?:s\d+)*)(?:-ch-(\d+)((?:-\d+)*))?$/.exec(anchor) : null;
  if (!m) return null;
  const index = (groups, sep) => groups.split(sep).filter(Boolean).map(sup).join("⁻");
  const article = `${m[1].replace(/-/g, ".")}${index(m[2], "s")}`;
  return m[3] ? `ст. ${article} ч. ${m[3]}${index(m[4], "-")}` : `ст. ${article}`;
}

/** The article a law clause belongs to (its level-2 ancestor), for the TOC highlight. */
export function kbArticleAnchor(clauses, anchor) {
  let article = null;
  for (const c of clauses) {
    if (c.level === 1) article = null;
    if (c.level === 2) article = c.anchor;
    if (c.anchor === anchor) return article;
  }
  return null;
}

// «(В редакции Федерального закона от 31.07.2025 № 295-ФЗ)»: a whole-line note
// that names an act by its date (slice 9, frame 3 A).
const EDITION_NOTE =
  /^\((?:[^()]*\s)?(?:в\s+редакции|в\s+ред\.|дополнен\S*|утратил\S*\s+силу|признан\S*\s+утративш\S*|исключен\S*|изменен\S*)[^()]*\sот\s+\d{2}\.\d{2}\.\d{4}[^()]*\)$/iu;

/**
 * Splits the edition note off the last line of a law clause: `{ text, note, noteStart }`,
 * the note without its brackets, noteStart its offset in the body (-1 without a note). Other clauses come back unchanged with a null note.
 */
export function kbEditionNote(clause) {
  const body = clause?.body ?? "";
  if (!kbIsLawAnchor(clause?.anchor)) return { text: body, note: null, noteStart: -1 };
  const at = body.lastIndexOf("\n");
  const last = (at >= 0 ? body.slice(at + 1) : body).replace(/\r$/, "");
  if (!EDITION_NOTE.test(last)) return { text: body, note: null, noteStart: -1 };
  // noteStart: where the note's text (after «(») begins in the body, for search highlights.
  return { text: at >= 0 ? body.slice(0, at).replace(/\r$/, "") : "", note: last.slice(1, -1), noteStart: at + 2 };
}

const fold = (s) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");

/**
 * Every occurrence of `query` in the clauses (heading, body), in reading
 * order: `{ anchor, field, start, end }`. Case and ё/е are ignored; a query
 * shorter than two characters finds nothing.
 */
export function kbSearchMatches(clauses, query) {
  const q = fold(String(query ?? "").trim());
  if (q.length < 2) return [];
  const out = [];
  for (const c of clauses) {
    for (const field of ["heading", "body"]) {
      const text = c[field];
      if (!text) continue;
      const hay = fold(text);
      let i = hay.indexOf(q);
      while (i >= 0) {
        out.push({ anchor: c.anchor, field, start: i, end: i + q.length });
        i = hay.indexOf(q, i + q.length);
      }
    }
  }
  return out;
}

/**
 * Splits a text into plain and highlighted pieces for the matches that fall in
 * it; `current` marks the active match (its index in the full match list).
 */
export function kbHighlight(text, matches, current = -1) {
  if (!matches.length) return [{ text, hit: false, current: false }];
  const pieces = [];
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start > at) pieces.push({ text: text.slice(at, m.start), hit: false, current: false });
    pieces.push({ text: text.slice(m.start, m.end), hit: true, current: m.index === current });
    at = m.end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), hit: false, current: false });
  return pieces;
}

/** «…/baza/<slug>/#p-7-2», the link «Скопировать ссылку на пункт» copies. */
export function kbClauseUrl(origin, slug, anchor) {
  return `${origin.replace(/\/$/, "")}/baza/${slug}/#${anchor}`;
}

/** Anchors are `p-…`, or a law's `st-…`, `gl-…`, `rz-…`, `cz-…` (slice 9); anything else in a hash is ignored. */
export function kbAnchorFromHash(hash) {
  let value;
  try {
    value = decodeURIComponent(String(hash ?? "").replace(/^#/, ""));
  } catch {
    return null;
  }
  return /^(?:p|st|gl|rz|cz)-[a-z0-9а-яё-]+$/.test(value) ? value : null;
}
