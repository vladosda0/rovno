// Article HTML sanitization (defense in depth) for the LIVE SPA render.
//
// content_html is produced by our own TipTap editor and written only by
// allowlisted blog authors, but the public page still refuses to trust the
// DB: every render passes through DOMPurify. The allow-list and the iframe
// host hook live in sanitizeConfig.mjs, shared verbatim with the build-time
// prerenderer (scripts/prerender-blog.mjs) so the static SSG snapshot and this
// live render can never diverge on what HTML they permit.

import DOMPurify from "dompurify";
import {
  sanitizeArticleHtmlWith,
  type DomPurifyLike,
} from "./sanitizeConfig.mjs";

export function sanitizeArticleHtml(html: string): string {
  return sanitizeArticleHtmlWith(DOMPurify as unknown as DomPurifyLike, html);
}
