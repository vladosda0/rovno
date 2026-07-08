// Heading anchors + table of contents for article bodies.
//
// Runs as a POST-PROCESS on already-sanitized HTML, at render time rather than
// at write time. Two consequences worth knowing:
//   - posts written before this existed get anchors for free, with no content
//     migration and no re-save;
//   - nothing here ever reaches the DB, so a change to the id scheme is a
//     deploy, not a data fix.
//
// Plain ESM so the build-time prerenderer (scripts/prerender-blog.mjs) and the
// live SPA render (anchors.ts) share ONE implementation — a static snapshot
// whose anchors disagreed with the hydrated app would break every #deep-link
// the moment React mounted.
//
// The caller supplies the DOM: `document` via DOMParser in the browser, jsdom
// in Node. Same injection shape as sanitizeConfig.mjs.

import { slugifyTitle } from "./slugify.mjs";

/** Below this many sections a TOC is noise, not navigation. */
export const MIN_TOC_ENTRIES = 3;

const TOC_TITLE = "Содержание";

/**
 * Element ids the app looks up by name (seo.ts, index.html, the prerenderer's
 * inlined data scripts). A heading id shares the document's id namespace, so a
 * section titled "Rv jsonld" would slugify onto one of these and hijack the
 * getElementById that owns it (DOM clobbering).
 *
 * This pass runs AFTER DOMPurify, so DOMPurify's own SANITIZE_DOM check never
 * sees these ids. This list is the only guard.
 */
// The real ids as they appear in the DOM. `root` and `rv-jsonld` are the only
// two a heading slug can actually collide with; the inlined data scripts use
// __BLOG_POST_DATA__ / __BLOG_LIST_DATA__, which slugifyTitle can never emit
// (no underscores, no uppercase) — kept here so the list names the true set.
const RESERVED_IDS = new Set([
  "root", "rv-jsonld", "__BLOG_POST_DATA__", "__BLOG_LIST_DATA__",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Stamp a stable, unique id on every h2/h3 inside `root`, in document order.
 * Mutates `root`. Returns the heading outline.
 *
 * Ids are transliterated from the heading text (so /blog/x/#zakupki, not #h-4)
 * and de-duplicated with a numeric suffix, because two sections may legitimately
 * share a title and a duplicate id would silently send both anchors to the first.
 */
export function annotateHeadings(root) {
  const toc = [];
  const seen = new Set();

  for (const el of root.querySelectorAll("h2, h3")) {
    const text = (el.textContent ?? "").trim();
    if (!text) continue;

    const base = slugifyTitle(text) || "razdel";
    // The `-2` suffix also resolves a collision with an app-owned id, so a
    // heading can never take one over: "Rv jsonld" -> #rv-jsonld-2.
    let id = base;
    for (let n = 2; seen.has(id) || RESERVED_IDS.has(id); n += 1) id = `${base}-${n}`;
    seen.add(id);

    el.setAttribute("id", id);
    toc.push({ id, text, level: el.tagName.toLowerCase() === "h2" ? 2 : 3 });
  }

  return toc;
}

/** Visible TOC. Only h2 sections — h3s stay anchored but off the list. */
export function tocHtml(toc) {
  const items = toc
    .filter((entry) => entry.level === 2)
    .map((entry) => `<li><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`)
    .join("");
  if (!items) return "";
  return (
    `<nav class="rv-toc" aria-label="${TOC_TITLE}">` +
    `<p class="rv-toc__title">${TOC_TITLE}</p>` +
    `<ol>${items}</ol>` +
    `</nav>`
  );
}

/**
 * Anchor every heading and prepend a TOC when the article is long enough.
 *
 * @param {string} html            Sanitized article body.
 * @param {(html: string) => { body: Element }} parseHtml
 *        Returns a Document-like object with a `body` element. The function
 *        must parse into a DETACHED document — never the live one.
 * @returns {{ html: string, toc: Array<{id: string, text: string, level: number}> }}
 */
export function annotateArticleHtml(html, parseHtml) {
  if (!html) return { html: "", toc: [] };

  const doc = parseHtml(html);
  const toc = annotateHeadings(doc.body);
  const body = doc.body.innerHTML;

  const sections = toc.filter((entry) => entry.level === 2).length;
  const prefix = sections >= MIN_TOC_ENTRIES ? tocHtml(toc) : "";

  return { html: prefix + body, toc };
}
