// Article HTML sanitization (defense in depth).
//
// content_html is produced by our own TipTap editor and written only by
// allowlisted blog authors, but the public page still refuses to trust the
// DB: every render passes through DOMPurify. iframes are allowed solely for
// video embeds from an explicit host allowlist (TipTap's YouTube extension
// emits <div data-youtube-video><iframe …>).

import DOMPurify from "dompurify";

const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "rutube.ru",
  "vk.com",
  "vkvideo.ru",
]);

let hookInstalled = false;

function ensureIframeHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const element = node as Element;
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

export function sanitizeArticleHtml(html: string): string {
  ensureIframeHook();
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "target"],
  });
}
