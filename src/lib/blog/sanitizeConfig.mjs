// Shared DOMPurify configuration for blog article HTML.
//
// Imported by BOTH the browser sanitizer (src/lib/blog/sanitize.ts, live SPA
// render) and the build-time prerenderer (scripts/prerender-blog.mjs, static
// SSG snapshot). The two render paths MUST allow exactly the same HTML: the
// static file is what anonymous visitors and crawlers receive before React
// hydrates, so a divergence there is a stored-XSS hole. Keeping the allow-list
// and the iframe-host hook in one place is the guarantee they cannot drift.
//
// Intentionally framework-agnostic plain ESM with no dompurify/jsdom import of
// its own, so a plain `node` build step loads it unchanged; each caller passes
// in its own configured DOMPurify instance (browser singleton, or jsdom-backed
// in Node).

export const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "rutube.ru",
  "vk.com",
  "vkvideo.ru",
]);

export const ARTICLE_PURIFY_OPTIONS = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "target"],
};

// Install the iframe host-allowlist hook on a DOMPurify instance exactly once.
// iframes survive DOMPurify only for video embeds from an explicit https host
// allowlist (TipTap's YouTube/video extensions emit them); everything else is
// dropped.
export function installArticleIframeHook(purify) {
  if (purify.__rvArticleIframeHook) return;
  purify.__rvArticleIframeHook = true;
  purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const element = node;
    const src = element.getAttribute("src") ?? "";
    let allowed = false;
    try {
      const url = new URL(src);
      allowed = url.protocol === "https:" && ALLOWED_IFRAME_HOSTS.has(url.host);
    } catch {
      allowed = false;
    }
    if (!allowed) element.remove();
  });
}

// Configure + run article sanitization on a caller-provided DOMPurify instance.
export function sanitizeArticleHtmlWith(purify, html) {
  installArticleIframeHook(purify);
  return purify.sanitize(html ?? "", ARTICLE_PURIFY_OPTIONS);
}
