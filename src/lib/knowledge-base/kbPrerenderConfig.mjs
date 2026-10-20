// Pure part of the knowledge-base prerenderer (scripts/prerender-kb.mjs):
// static HTML for /baza/<slug>/, head tags, sitemap entries. No I/O here, so it
// is unit-tested (kbPrerender.test.ts). The facts and buttons come from the same
// buildKbDocumentView the SPA renders, so the static snapshot and the hydrated
// page say the same thing.

import { buildKbDocumentView, kbDocPath, kbPageDescription, kbPageTitle, normalizeKbRow } from "./kbConfig.mjs";

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
  return `<footer style="padding:48px;background:var(--rv-ink);color:var(--rv-cream);font-family:var(--font-body);font-size:13px"><a href="/" style="color:var(--rv-cream)">rovno.ai</a> — ИИ-супервайзер стройки</footer></div>`;
}

/** Markup for #root, mirroring KbDocumentPage's classes so the blog CSS styles it. */
export function kbDocumentRootHtml(row, t) {
  const doc = normalizeKbRow(row);
  const view = buildKbDocumentView(doc, t);
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
    <nav class="rv-breadcrumbs" aria-label="Навигация по разделам"><ol><li><span>${escapeHtml(t("home.knowledgeBase.title"))}</span></li><li><span aria-current="page">${escapeHtml(t(`home.knowledgeBase.folders.${doc.folder}.title`))}</span></li></ol></nav>
    <header class="rv-article-header"><h1 class="rv-article-title">${escapeHtml(view.heading)}</h1>${category}</header>
    ${facts}${fullTextNote}
    <div class="rv-kb-actions">${buttons}${askShurik}</div>
  </section></article></main>
  ${chromeEnd()}`;
}

/** Drop canonical/og:url from the app shell (prerender-blog stamps the landing one). */
export function stripCanonicalTags(html) {
  return html
    .replace(/[ \t]*<link rel="canonical"[^>]*>\n?/g, "")
    .replace(/[ \t]*<meta property="og:url"[^>]*>\n?/g, "");
}

/**
 * The full static page from the app-shell template. FUNCTION replacements only:
 * a `$&`-style sequence in a title must not splice template fragments in.
 */
export function kbPageHtml(template, row, t, cssAssets = []) {
  const doc = normalizeKbRow(row);
  const title = kbPageTitle(doc);
  const description = kbPageDescription(doc);
  const canonical = `${SITE_ORIGIN}${kbDocPath(doc.slug)}`;

  let html = stripCanonicalTags(template);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*\/>/, () => `<meta name="description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta property="og:title"[^>]*\/>/, () => `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = html.replace(
    /<meta property="og:description"[^>]*\/>/,
    () => `<meta property="og:description" content="${escapeHtml(description)}" />`,
  );
  html = html.replace(/<meta name="twitter:title"[^>]*\/>/, () => `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta property="og:type"[^>]*\/>/, () => `<meta property="og:type" content="article" />`);

  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    ...(/<meta property="og:type"/.test(html) ? [] : [`<meta property="og:type" content="article" />`]),
    ...cssAssets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`),
  ].join("\n    ");
  html = html.replace("</head>", () => `    ${head}\n  </head>`);

  const data = `<script type="application/json" id="${KB_DOC_DATA_ID}">${jsonForScriptTag(row)}</script>`;
  html = html.replace(/<div id="root"><\/div>/, () => `<div id="root">${kbDocumentRootHtml(row, t)}</div>\n    ${data}`);
  return html;
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
