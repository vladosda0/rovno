// Pure part of the knowledge-base prerenderer (scripts/prerender-kb.mjs):
// static HTML for /baza/<slug>/, head tags, sitemap entries. No I/O here, so it
// is unit-tested (kbPrerender.test.ts). The facts and buttons come from the same
// buildKbDocumentView the SPA renders, so the static snapshot and the hydrated
// page say the same thing.

import { buildKbDocumentView, kbDocPath, normalizeKbRow } from "./kbConfig.mjs";
import { kbEditionLine, kbTextLabel, normalizeKbClause } from "./kbFullText.mjs";
import {
  KB_INDEX_PATH,
  kbBreadcrumbTrail,
  kbCollectionJsonLd,
  kbDocumentDescription,
  kbDocumentJsonLd,
  kbDocumentTitle,
  kbFirstText,
  kbFolderDescription,
  kbFolderItem,
  kbFolderPath,
  kbFolderTitle,
  kbIndexDescription,
  kbIndexItems,
  kbIndexTitle,
  documentsCountText,
} from "./kbSeo.mjs";

export const SITE_ORIGIN = "https://rovno.ai";
export const KB_DOC_DATA_ID = "__KB_DOC_DATA__";
/** Same og:site_name as prerender-blog.mjs and src/lib/blog/seo.ts. */
export const SITE_NAME = "Ровно ИИ";

/** Slugs become directory names under dist/baza/: nothing that could escape it. */
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSafeSlug(slug) {
  return typeof slug === "string" && SAFE_SLUG.test(slug) && !slug.includes("..");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** JSON safe to embed in <script> (no `</script>` breakout). */
function jsonForScriptTag(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/** t(key, vars) over a flat locale dictionary (src/locales/ru.json). */
export function createTranslator(dict) {
  return (key, vars = {}) => {
    const template = typeof dict?.[key] === "string" ? dict[key] : key;
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(vars[name] ?? ""));
  };
}

function chromeStart() {
  return `<div class="rv-landing"><header style="padding:24px 48px;border-bottom:1px solid var(--line-blue-soft)"><a href="/" style="display:inline-flex"><img src="/logo.svg" alt="ровно" style="height:52px;width:auto" /></a></header>`;
}

function chromeEnd() {
  return `<footer style="padding:48px;background:var(--rv-ink);color:var(--rv-cream);font-family:var(--font-body);font-size:13px"><a href="/" style="color:var(--rv-cream)">rovno.ai</a> — ИИ-супервайзер стройки · <a href="/baza/" style="color:var(--rv-cream)">База знаний</a> · <a href="/blog/" style="color:var(--rv-cream)">Блог</a></footer></div>`;
}

/**
 * The full text in the static page (slice 2, step 2.6): label, edition line and
 * every clause with its anchor, so a search engine finds the document by a
 * phrase from a clause and `#p-7-2` lands on the clause before the SPA loads.
 */
export function kbFullTextHtml(doc, clauses, t) {
  if (!clauses.length) return "";
  const label = kbTextLabel(doc, t);
  const edition = kbEditionLine(doc, t);
  const head = [
    label ? `<span class="rv-kb-label rv-kb-label--${label.kind}">${escapeHtml(label.text)}</span>` : "",
    edition ? `<span class="rv-kb-edition">${escapeHtml(edition)}</span>` : "",
  ].join(" ");
  const number = (c) => (c.number && /^\d/.test(c.number) ? `${escapeHtml(c.number)} ` : "");
  const body = clauses
    .map((c) => {
      const id = escapeHtml(c.anchor);
      if (c.heading && !c.body) {
        const tag = c.level === 1 || !/^\d/.test(c.number ?? "") ? "h2" : "h3";
        return `<${tag} id="${id}">${number(c)}${escapeHtml(c.heading)}</${tag}>`;
      }
      const heading = c.heading ? `<strong>${number(c)}${escapeHtml(c.heading)}</strong> ` : `<strong>${number(c)}</strong>`;
      return `<p id="${id}">${heading}${escapeHtml(c.body)}</p>`;
    })
    .join("");
  return `<section class="rv-kb-text"><p>${head}</p>${body}</section>`;
}

/** The visible trail; the last entry is the current page and not a link. */
export function kbBreadcrumbsHtml(trail) {
  const last = trail.length - 1;
  const items = trail
    .map((entry, i) =>
      i === last
        ? `<li><span aria-current="page">${escapeHtml(entry.name)}</span></li>`
        : `<li><a href="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</a></li>`,
    )
    .join("");
  return `<nav class="rv-breadcrumbs" aria-label="Навигация по разделам"><ol>${items}</ol></nav>`;
}

/** Markup for #root, mirroring KbDocumentPage's classes so the blog CSS styles it. */
export function kbDocumentRootHtml(row, t, { clauses = [], spFullText = true } = {}) {
  const doc = normalizeKbRow(row);
  const view = buildKbDocumentView(doc, t, { spFullText });
  const fullText = view.readable ? kbFullTextHtml(doc, clauses.map(normalizeKbClause), t) : "";
  const facts = view.rows.length
    ? `<dl class="rv-kb-facts">${view.rows
        .map((r) => `<div class="rv-kb-facts__row"><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`)
        .join("")}</dl>`
    : "";
  const fullTextNote = view.showFullTextLater
    ? `<p style="font-family:var(--font-body);color:var(--rv-blue);font-size:16px;opacity:.72">${escapeHtml(t("home.knowledgeBase.fullTextLater"))}</p>`
    : "";
  const buttons = view.buttons
    .map(
      (b, i) =>
        `<a class="rv-btn ${i === 0 ? "rv-btn--primary" : "rv-btn--secondary"}" href="${escapeHtml(b.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.label)}</a>`,
    )
    .join("");
  // The static snapshot is what a guest from search sees, so it carries the guest
  // CTA (step 1.6); the SPA re-renders #root and drops it for a signed-in user.
  const askShurik = `<a class="rv-btn rv-btn--secondary rv-kb-ask" href="/auth/signup">${escapeHtml(t("home.knowledgeBase.askShurik"))}</a>`;
  const category = doc.category ? `<p class="rv-article-subtitle">${escapeHtml(doc.category)}</p>` : "";
  return `${chromeStart()}
  <main><article class="rv-kb-doc"><section class="rv-section" style="padding:64px 48px 96px">
    ${kbBreadcrumbsHtml(kbBreadcrumbTrail(t, { doc }))}
    <header class="rv-article-header"><h1 class="rv-article-title">${escapeHtml(view.heading)}</h1>${category}</header>
    ${facts}${fullTextNote}
    <div class="rv-kb-actions">${buttons}${askShurik}</div>
    ${fullText}
  </section></article></main>
  ${chromeEnd()}`;
}

/** Drop canonical/og:url from the app shell (prerender-blog stamps the landing one). */
export function stripCanonicalTags(html) {
  return html
    .replace(/[ \t]*<link rel="canonical"[^>]*>\n?/g, "")
    .replace(/[ \t]*<meta property="og:url"[^>]*>\n?/g, "");
}

export { documentsCountText };

function jsonLdTag(jsonLd) {
  return `<script type="application/ld+json" id="rv-jsonld">${jsonForScriptTag(jsonLd)}</script>`;
}

/**
 * The app-shell template with this page's head: title, description, a single
 * canonical, og/twitter tags, JSON-LD, optional robots. FUNCTION replacements
 * only: a `$&`-style sequence in a title must not splice template fragments in.
 */
export function withKbHead(template, { title, description, canonicalPath, ogType = "article", jsonLd = null, robots = null, cssAssets = [] }) {
  const canonical = `${SITE_ORIGIN}${canonicalPath}`;
  let html = stripCanonicalTags(template);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*\/>/, () => `<meta name="description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta property="og:title"[^>]*\/>/, () => `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = html.replace(
    /<meta property="og:description"[^>]*\/>/,
    () => `<meta property="og:description" content="${escapeHtml(description)}" />`,
  );
  html = html.replace(/<meta name="twitter:title"[^>]*\/>/, () => `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta property="og:type"[^>]*\/>/, () => `<meta property="og:type" content="${ogType}" />`);

  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    ...(/<meta property="og:type"/.test(html) ? [] : [`<meta property="og:type" content="${ogType}" />`]),
    ...(robots ? [`<meta name="robots" content="${escapeHtml(robots)}" />`] : []),
    ...(jsonLd ? [jsonLdTag(jsonLd)] : []),
    ...cssAssets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`),
  ].join("\n    ");
  return html.replace("</head>", () => `    ${head}\n  </head>`);
}

/** The full static document page from the app-shell template. */
export function kbPageHtml(template, row, t, cssAssets = [], fullText = {}) {
  const doc = normalizeKbRow(row);
  const spFullText = fullText.spFullText ?? true;
  const clauses = (fullText.clauses ?? []).map(normalizeKbClause);
  const description = kbDocumentDescription(doc, t, { spFullText, firstText: kbFirstText(clauses) });
  let html = withKbHead(template, {
    title: kbDocumentTitle(doc, { spFullText }),
    description,
    canonicalPath: kbDocPath(doc.slug),
    jsonLd: kbDocumentJsonLd(doc, t, { clauses, spFullText, description }),
    cssAssets,
  });
  const data = `<script type="application/json" id="${KB_DOC_DATA_ID}">${jsonForScriptTag(row)}</script>`;
  html = html.replace(/<div id="root"><\/div>/, () => `<div id="root">${kbDocumentRootHtml(row, t, fullText)}</div>\n    ${data}`);
  return html;
}

const H1 = 'style="font-family:var(--font-display);font-size:56px;line-height:1;letter-spacing:-0.03em;color:var(--rv-blue);margin:16px 0 0"';
const LEAD = 'style="font-family:var(--font-body);font-size:18px;color:var(--rv-blue);opacity:.8;margin-top:12px"';

/** /baza/: every folder with its count and description, each a link. */
export function kbIndexRootHtml(counts, t) {
  const items = kbIndexItems(counts, t);
  const total = items.reduce((n, i) => n + i.count, 0);
  const list = items
    .map(
      (i) =>
        `<li class="rv-kb-folder"><a href="${escapeHtml(i.path)}"><strong>${escapeHtml(i.name)}</strong></a><span>${escapeHtml(i.description)} · ${escapeHtml(documentsCountText(t, i.count))}</span></li>`,
    )
    .join("");
  return `${chromeStart()}
  <main><section class="rv-section rv-kb-hub" style="padding:64px 48px 96px">
    ${kbBreadcrumbsHtml(kbBreadcrumbTrail(t))}
    <h1 ${H1}>${escapeHtml(t("home.knowledgeBase.title"))}</h1>
    <p ${LEAD}>${escapeHtml(t("home.knowledgeBase.subtitle"))} ${escapeHtml(t("home.knowledgeBase.public.total", { count: total }))}</p>
    <ul class="rv-kb-folders">${list}</ul>
  </section></main>
  ${chromeEnd()}`;
}

export function kbIndexPageHtml(template, counts, t, cssAssets = []) {
  const items = kbIndexItems(counts, t);
  const total = items.reduce((n, i) => n + i.count, 0);
  const title = kbIndexTitle();
  const description = kbIndexDescription(total);
  const html = withKbHead(template, {
    title,
    description,
    canonicalPath: KB_INDEX_PATH,
    ogType: "website",
    jsonLd: kbCollectionJsonLd(t, { items, name: title, description }),
    cssAssets,
  });
  return html.replace(/<div id="root"><\/div>/, () => `<div id="root">${kbIndexRootHtml(counts, t)}</div>`);
}

function pagerHtml(folder, page, pages) {
  if (pages <= 1) return "";
  const links = [];
  for (let p = 1; p <= pages; p++) {
    links.push(p === page ? `<span aria-current="page">${p}</span>` : `<a href="${escapeHtml(kbFolderPath(folder, p))}">${p}</a>`);
  }
  return `<nav class="rv-kb-pager" aria-label="Страницы раздела">${links.join(" ")}</nav>`;
}

/** /baza/razdel/<folder>/[<page>/]: the folder's documents as links, with edition or label. */
export function kbFolderRootHtml(folder, docs, t, { page = 1, pages = 1, total = docs.length, spFullText = true } = {}) {
  const list = docs
    .map((d) => {
      const item = kbFolderItem(d, t, { spFullText });
      const label = item.label ? `<span class="rv-kb-label rv-kb-label--${item.label.kind}">${escapeHtml(item.label.text)}</span> ` : "";
      const note = item.note ? `<span>${label}${escapeHtml(item.note)}</span>` : label ? `<span>${label}</span>` : "";
      return `<li class="rv-kb-doc-item"><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a>${note}</li>`;
    })
    .join("");
  const name = t(`home.knowledgeBase.folders.${folder}.title`);
  return `${chromeStart()}
  <main><section class="rv-section rv-kb-hub" style="padding:64px 48px 96px">
    ${kbBreadcrumbsHtml(kbBreadcrumbTrail(t, { folder }))}
    <h1 ${H1}>${escapeHtml(name)}</h1>
    <p ${LEAD}>${escapeHtml(t(`home.knowledgeBase.folders.${folder}.description`))} · ${escapeHtml(documentsCountText(t, total))}</p>
    <ul class="rv-kb-doc-list">${list}</ul>
    ${pagerHtml(folder, page, pages)}
  </section></main>
  ${chromeEnd()}`;
}

export function kbFolderPageHtml(template, folder, rows, t, { page = 1, pages = 1, total = rows.length, spFullText = true, cssAssets = [] } = {}) {
  const docs = rows.map(normalizeKbRow);
  const title = kbFolderTitle(folder, t, page);
  const description = kbFolderDescription(folder, t, total);
  const items = docs.map((d) => kbFolderItem(d, t, { spFullText }));
  const html = withKbHead(template, {
    title,
    description,
    canonicalPath: kbFolderPath(folder, page),
    ogType: "website",
    jsonLd: kbCollectionJsonLd(t, { folder, page, items, name: title, description }),
    cssAssets,
  });
  return html.replace(
    /<div id="root"><\/div>/,
    () => `<div id="root">${kbFolderRootHtml(folder, docs, t, { page, pages, total, spFullText })}</div>`,
  );
}

/** One sitemap <url> per publishable row; lastmod from updated_at, else today. */
export function kbSitemapUrls(rows, today) {
  const out = [];
  for (const row of rows) {
    if (!isSafeSlug(row?.slug)) continue;
    const lastmod = (typeof row.updated_at === "string" && row.updated_at.slice(0, 10)) || today;
    out.push(`  <url><loc>${escapeHtml(`${SITE_ORIGIN}${kbDocPath(row.slug)}`)}</loc><lastmod>${lastmod}</lastmod></url>`);
  }
  return out;
}

/** Append entries to the sitemap prerender-blog wrote (or start one if absent). */
/** Sitemap lines for the index and folder pages (paths from kbFolderPath). */
export function kbHubSitemapUrls(paths, today) {
  return paths.map((p) => `  <url><loc>${escapeHtml(`${SITE_ORIGIN}${p}`)}</loc><lastmod>${today}</lastmod></url>`);
}

/** Slugs a document cannot take: they are the public folder pages' segment. */
export const KB_RESERVED_SLUGS = new Set(["razdel"]);

/** Sorted by designation, title, doc_id. */
export function sortKbRows(rows) {
  const key = (v) => (typeof v === "string" ? v : "");
  return [...rows].sort((a, b) => {
    const da = key(a.designation), db = key(b.designation);
    if (!da !== !db) return da ? -1 : 1;
    return da.localeCompare(db, "ru") || key(a.title).localeCompare(key(b.title), "ru") || key(a.doc_id).localeCompare(key(b.doc_id));
  });
}

export function mergeIntoSitemap(xml, lines) {
  const body = lines.join("\n");
  if (typeof xml === "string" && xml.includes("</urlset>")) {
    // Idempotent: entries from an earlier run of this script are replaced, not doubled.
    xml = xml.replace(/^[ \t]*<url><loc>[^<]*\/baza\/[^<]*<\/loc>.*<\/url>\n/gm, "");
    if (!body) return xml;
    const at = xml.lastIndexOf("</urlset>");
    return `${xml.slice(0, at)}${body}\n${xml.slice(at)}`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}${body ? "\n" : ""}</urlset>
`;
}

/**
 * The landing-canonical guard, the blog's own rule extended to /baza/.
 *
 * dist/index.html is the static host's SPA fallback, and prerender-blog stamps it
 * with the landing canonical «/» once it has written articles. Every /baza/<slug>/
 * URL without its own file is then served that shell and tells a crawler «I am a
 * duplicate of /», which deindexes the knowledge base outright. prerender-blog
 * avoids exactly this for articles by not stamping when it wrote none; here the
 * stamp is already there, so when this run failed to fetch the base and wrote zero
 * KB pages the fallback goes back to the canonical-less shell (the landing «/»
 * then has no canonical for that build too). A healthy empty base, or a backend
 * without the table yet, keeps «/»: there is no /baza/ page to protect.
 * Returns the new shell, or null for «leave it».
 */
export function fallbackShellWithoutKbPages(indexHtml, { pagesWritten, fetchFailed }) {
  if (pagesWritten > 0 || !fetchFailed) return null;
  if (!/<link rel="canonical"/.test(indexHtml)) return null;
  return stripCanonicalTags(indexHtml);
}
