// Heading anchors + TOC for the LIVE SPA render.
//
// DOMParser gives us an inert, detached document: scripts don't run and images
// don't fetch while we walk the headings. The shared pass in anchorsConfig.mjs
// is the same one scripts/prerender-blog.mjs runs against jsdom.

import { annotateArticleHtml, type TocEntry } from "./anchorsConfig.mjs";

export type { TocEntry };

/** Anchor headings and prepend a TOC. Input must already be sanitized. */
export function withHeadingAnchors(html: string): { html: string; toc: TocEntry[] } {
  return annotateArticleHtml(html, (source) =>
    new DOMParser().parseFromString(source, "text/html"),
  );
}
