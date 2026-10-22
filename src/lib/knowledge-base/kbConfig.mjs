// Shared plain-ESM helpers for the knowledge base («База знаний», epic docs-library).
//
// Plain .mjs so the build-time prerenderer (scripts/prerender-kb.mjs) and the SPA
// run the SAME rules: which links are shown, what the source button says, how a
// title and a date read. Types live in kbConfig.d.mts.

import { kbEditionLine, kbFullTextReadable, kbTextLabel, normalizeKbFullTextFields } from "./kbFullText.mjs";

/** Folder ids in the approved display order (mockup v3, frame 1). */
export const KB_FOLDERS = [
  "sp",
  "gost",
  "laws",
  "snip",
  "sanpin",
  "guides",
  "manufacturers",
  "international",
  "cis",
  "other",
];

export const KB_PAGE_SIZE = 24;

/** «СП 71.13330 Изоляционные…» when there is a designation, else the title. */
export function displayTitle(doc) {
  const { designation, title } = titleParts(doc);
  return designation ? `${designation} ${title}`.trim() : title;
}

/**
 * Trimmed parts, with the designation dropped when the title already starts with
 * it (case-insensitive): «СП 71.13330.2017 …» must not read «СП 71.13330 СП 71…».
 */
function titleParts(doc) {
  const designation = (doc?.designation ?? "").trim();
  const title = (doc?.title ?? "").trim();
  if (designation && title.toLocaleLowerCase("ru").startsWith(designation.toLocaleLowerCase("ru"))
      && /^(?:$|[\s.,:;«"(—–-])/u.test(title.slice(designation.length))) {
    return { designation: "", title };
  }
  if (designation && !title) return { designation: "", title: designation };
  return { designation, title };
}

/** ISO date (or timestamp) to DD.MM.YYYY by string slicing: no timezone drift. */
export function formatKbDate(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function parseHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Host without a leading «www.». */
export function sourceHost(value) {
  const url = parseHttpUrl(value);
  if (!url) return "";
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

const KIND_ORDER = { official: 0, copy: 1, catalog: 2 };

/**
 * Only http/https links survive (anything else is dropped), official first.
 * The sort is stable, so the registry's own order holds inside one kind.
 */
export function safeSourceLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const links = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (!parseHttpUrl(item.url)) continue;
    const kind = item.kind === "official" || item.kind === "catalog" ? item.kind : "copy";
    links.push({ url: item.url, kind });
  }
  return links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => (KIND_ORDER[a.link.kind] - KIND_ORDER[b.link.kind]) || a.index - b.index)
    .map(({ link }) => link);
}

/**
 * What the source button says, as a label key under `home.knowledgeBase.source.*`
 * plus the host for the generic «Открыть на сайте {{host}}».
 */
export function sourceButtonLabel(link, folder) {
  const url = parseHttpUrl(link?.url);
  const host = sourceHost(link?.url);
  if (!url) return { key: "generic", host };
  if (host === "minstroyrf.gov.ru" || host.endsWith(".minstroyrf.gov.ru")) {
    return { key: link.kind === "catalog" ? "minstroyCatalog" : "minstroy", host };
  }
  if (host === "consultant.ru" || host.endsWith(".consultant.ru")) return { key: "consultant", host };
  if (host === "gostexpert.ru") return { key: "gostexpert", host };
  if (folder === "manufacturers") {
    return { key: url.pathname.toLowerCase().endsWith(".pdf") ? "manufacturerPdf" : "manufacturerSite", host };
  }
  return { key: "generic", host };
}

/**
 * User input for a PostgREST `or=(...)` ilike filter. Every character that means
 * something to PostgREST (`,` `(` `)` `"` `\` `*`) or to LIKE (`%`) becomes `_`,
 * LIKE's single-character wildcard: the pattern still matches the literal
 * character, and no quoting rules are involved. Whitespace runs collapse.
 */
export function sanitizeSearchTerm(input) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[%,()"\\*]/g, "_");
}

/** `designation.ilike.%q%,title.ilike.%q%`, or null for a blank query. */
export function searchOrFilter(input) {
  const term = sanitizeSearchTerm(input);
  if (!term) return null;
  return `designation.ilike.%${term}%,title.ilike.%${term}%`;
}

/** Public page path. Trailing slash: the static host 308s the bare form. */
export function kbDocPath(slug) {
  return `/baza/${slug}/`;
}

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim() !== "").map((s) => s.trim());
}

/** A kb_documents row (snake_case, loosely typed) to the shape the UI reads. */
export function normalizeKbRow(row) {
  const r = row ?? {};
  return {
    docId: String(r.doc_id ?? ""),
    slug: String(r.slug ?? ""),
    designation: stringOrNull(r.designation),
    title: String(r.title ?? ""),
    category: String(r.category ?? ""),
    folder: typeof r.folder === "string" && KB_FOLDERS.includes(r.folder) ? r.folder : "other",
    displayMode: r.display_mode === "full_text" ? "full_text" : "card",
    objectTypes: stringList(r.object_types),
    domains: stringList(r.domains),
    applicabilityNote: stringOrNull(r.applicability_note),
    publisher: stringOrNull(r.publisher),
    country: stringOrNull(r.country),
    edition: stringOrNull(r.edition),
    effectiveFrom: stringOrNull(r.effective_from),
    lastCheckedAt: stringOrNull(r.last_checked_at),
    sourceLinks: safeSourceLinks(r.source_links),
    fullTextAvailable: r.full_text_available === true,
    ...normalizeKbFullTextFields(r),
  };
}

/** «СП 71.13330 · Изоляционные…» for a document header; tiles use a space. */
export function kbHeading(doc) {
  const { designation, title } = titleParts(doc);
  return designation ? `${designation} · ${title}` : title;
}

/** Known publishers named in the «Источник» row; the key is under `sourceName.*`. */
function sourceNameKey(host) {
  const on = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (on("minstroyrf.gov.ru")) return "minstroy";
  if (on("consultant.ru")) return "consultant";
  if (on("pravo.gov.ru")) return "pravo";
  return null;
}

/** «Минстрой России, minstroyrf.gov.ru» for a known host, else the host alone. */
export function sourceRowValue(url, t) {
  const host = sourceHost(url);
  const key = sourceNameKey(host);
  return key ? t("home.knowledgeBase.sourceWithName", { name: t(`home.knowledgeBase.sourceName.${key}`), host }) : host;
}

export const KB_SITE_SECTION = "База знаний Ровно";

/** <title> of the public page. */
export function kbPageTitle(doc) {
  return `${kbHeading(doc)} — ${KB_SITE_SECTION}`;
}

/** <meta description> of the public page, at most ~160 characters. */
export function kbPageDescription(doc) {
  const parts = [doc?.category, doc?.applicabilityNote, doc?.edition ? `Редакция: ${doc.edition}` : null]
    .filter((p) => typeof p === "string" && p.trim());
  const text = `${displayTitle(doc)}. ${parts.join(". ")}`.replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

/**
 * Rows, source buttons and the «full text later» note for one document, shared by
 * the in-app window, the public page and the prerenderer. `t(key, vars)` resolves
 * `home.knowledgeBase.*` locale keys. Empty rows are left out.
 *
 * A document with its full text (slice 2) reads its edition from the collected
 * text («Текст 2017 года, без изменений № 1-4») and carries a «Статус» row with
 * the label instead of «Проверено» (label v2, frame 3). `spFullText` is the SP
 * switch (R-10): off, an SP reads exactly as after slice 1.
 */
export function buildKbDocumentView(doc, t, { spFullText = true } = {}) {
  const readable = kbFullTextReadable(doc, spFullText);
  const label = readable ? kbTextLabel(doc, t) : null;
  const rows = [];
  const push = (key, value, badge) => {
    if (typeof value === "string" && value.trim()) {
      rows.push({ key, label: t(`home.knowledgeBase.fields.${key}`), value, ...(badge ? { badge } : {}) });
    }
  };
  push("applicability", doc.applicabilityNote);
  push("objectTypes", doc.objectTypes.join(", "));
  push("domains", doc.domains.join(", "));
  push("publisher", doc.publisher);
  push("country", doc.country);
  push("edition", (readable && kbEditionLine(doc, t)) || doc.edition);
  push("effectiveFrom", formatKbDate(doc.effectiveFrom));
  if (label) push("status", label.text, label.kind);
  else push("checked", formatKbDate(doc.lastCheckedAt));
  const first = doc.sourceLinks[0];
  push("source", first ? sourceRowValue(first.url, t) : t("home.knowledgeBase.noSource"));

  const buttons = doc.sourceLinks.map((link) => {
    const { key, host } = sourceButtonLabel(link, doc.folder);
    return { href: link.url, label: t(`home.knowledgeBase.source.${key}`, { host }) };
  });

  return {
    heading: kbHeading(doc),
    rows,
    buttons,
    readable,
    label,
    showFullTextLater: doc.displayMode === "full_text" && !readable,
  };
}
