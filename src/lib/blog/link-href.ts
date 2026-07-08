// Href normalization for the article editor's link tool.
//
// Split out of RichTextEditor so it can be unit-tested without mounting TipTap.

import { SITE_ORIGIN } from "./seo";

const SAFE_SCHEME_RE = /^(https?|mailto|tel):/i;
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Turn what the author typed into an href, or null if it can't be one.
 *
 * Bare `rovno.ai/x` gets https://, but a root-relative `/blog/x`, an in-page
 * `#anchor` and `mailto:` must survive untouched — those are exactly the
 * internal-cluster and contact links an article needs, and blindly prefixing
 * https:// would turn every one of them into a dead absolute URL.
 *
 * Unknown schemes (javascript:, data:) are refused outright rather than
 * mangled into `https://javascript:…`. TipTap's isAllowedUri and DOMPurify both
 * catch those downstream; this is the first of the three.
 */
export function normalizeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (SAFE_SCHEME_RE.test(href)) return href;
  if (ANY_SCHEME_RE.test(href)) return null;
  return `https://${href}`;
}

/**
 * Same-site links stay in the tab; only outbound links get target=_blank.
 *
 * Compared against SITE_ORIGIN rather than window.location.origin: an author
 * pasting the absolute https://rovno.ai/blog/x while editing on localhost still
 * means "internal", and the target baked into the mark ships to production.
 */
export function isInternalHref(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    return new URL(href).origin === new URL(SITE_ORIGIN).origin;
  } catch {
    return false;
  }
}
