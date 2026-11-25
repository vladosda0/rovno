// Pure helpers of scripts/prerender-public.mjs (site-redesign 1.2, 1.3).
// Kept free of filesystem access so vitest can exercise them directly.

export const SITE_ORIGIN = "https://rovno.ai";
export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

const MARK_START = "<!--rv-prerender-head-->";
const MARK_END = "<!--/rv-prerender-head-->";

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "/offer/" and "/offer" are one document on the static host. */
export function normalizeRoute(pathname) {
  const trimmed = String(pathname || "/").replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function jsonForScriptTag(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Inline guard, first thing after the marker in <head>: dist/index.html is the
 * host's SPA fallback, so the landing markup in it would flash on a cold load
 * of /home or any other app address. Plain ES3, served untranspiled.
 */
export function prerenderGuard(route, cssAssets = []) {
  const own = JSON.stringify(normalizeRoute(route));
  // The site stylesheet is written only on the page's own address: every app
  // route cold-loads this same file and must not wait for it.
  const links = cssAssets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join("");
  const load = links ? `else document.write(${JSON.stringify(links).replace(/</g, "\\u003c")})` : "";
  return (
    `<style>html[data-rv-prerender-off] [data-prerendered-route]{display:none!important}</style>\n    ` +
    `<script>(function(){var p=location.pathname.replace(/\\/+$/,"")||"/";` +
    `if(p!==${own})document.documentElement.setAttribute("data-rv-prerender-off","");${load}})()</script>`
  );
}

/** Removes this script's marked head block and #root markup, so prerender-blog
 * and prerender-kb get an empty root on a rerun. The title, description, OG and
 * twitter tags it rewrote in place stay as the landing's. */
export function stripPublicPage(html) {
  return html
    .replace(new RegExp(`\\s*${MARK_START}[\\s\\S]*?${MARK_END}`), "")
    .replace(/<div id="root"><div data-prerendered-route="[^"]*">[\s\S]*?<\/div><!--\/rv-prerendered--><\/div>/, '<div id="root"></div>');
}

function replaceTag(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, () => tag) : html;
}

/**
 * Put a rendered public page into the app shell: its title, description, OG
 * and twitter tags, one canonical, the 1200x630 link card, JSON-LD, the CSS
 * chunks its markup needs, the pre-paint guard and the markup itself.
 * Idempotent: everything it adds sits between markers and is replaced on rerun.
 */
export function injectPublicPage(template, page) {
  const { head, jsonLd, rootHtml, cssAssets = [] } = page;
  let html = template;

  // Drop a previous run's block and markup first (idempotency).
  html = stripPublicPage(html);
  if (!/<div id="root"><\/div>/.test(html)) {
    throw new Error("injectPublicPage: template has no empty <div id=\"root\"></div>");
  }

  const title = escapeHtml(head.title);
  const description = escapeHtml(head.description);
  const canonical = escapeHtml(`${SITE_ORIGIN}${head.route}`);

  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = replaceTag(html, /<meta name="description"[^>]*\/>/, `<meta name="description" content="${description}" />`);
  html = replaceTag(html, /<meta property="og:title"[^>]*\/>/, `<meta property="og:title" content="${title}" />`);
  html = replaceTag(html, /<meta property="og:description"[^>]*\/>/, `<meta property="og:description" content="${description}" />`);
  html = replaceTag(html, /<meta property="og:type"[^>]*\/>/, `<meta property="og:type" content="website" />`);
  html = replaceTag(html, /<meta property="og:image"[^>]*\/>/, `<meta property="og:image" content="${OG_IMAGE}" />`);
  html = replaceTag(html, /<meta name="twitter:card"[^>]*\/>/, `<meta name="twitter:card" content="summary_large_image" />`);
  html = replaceTag(html, /<meta name="twitter:title"[^>]*\/>/, `<meta name="twitter:title" content="${title}" />`);
  // dist/index.html (route "/") is also the host's SPA fallback for every
  // address without a file. Its canonical is owned by prerender-blog.mjs, which
  // writes it only on a build that wrote the article files (see the long note
  // there), and it must never carry og:url: shared previews of /share/... would
  // all point at the landing. The 1:1 legal files get both.
  const isFallbackShell = head.route === "/";
  if (!isFallbackShell) html = html.replace(/[ \t]*<link rel="canonical"[^>]*>\n?/g, "");

  const tags = [
    ...(isFallbackShell
      ? []
      : [`<link rel="canonical" href="${canonical}" />`, `<meta property="og:url" content="${canonical}" />`]),
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    ...jsonLd.map((block) => `<script type="application/ld+json">${jsonForScriptTag(block)}</script>`),
    ...(rootHtml
      ? cssAssets.map((href) => `<noscript><link rel="stylesheet" href="${escapeHtml(href)}" /></noscript>`)
      : []),
  ];
  if (rootHtml) tags.unshift(prerenderGuard(head.route, cssAssets));
  html = html.replace(
    "</head>",
    () => `    ${MARK_START}\n    ${tags.join("\n    ")}\n    ${MARK_END}\n  </head>`,
  );

  if (rootHtml) {
    html = html.replace(
      /<div id="root"><\/div>/,
      () =>
        `<div id="root"><div data-prerendered-route="${escapeHtml(head.route)}">${rootHtml}</div><!--/rv-prerendered--></div>`,
    );
  }
  return html;
}
