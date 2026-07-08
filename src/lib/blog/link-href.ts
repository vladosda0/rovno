// Href normalization for the article editor's link tool.
//
// Split out of RichTextEditor so it can be unit-tested without mounting TipTap.

import { SITE_ORIGIN } from "./seo";

const SAFE_SCHEME_RE = /^(https?|mailto|tel):/i;

/**
 * A scheme, not a host:port.
 *
 * `^[a-z][a-z0-9+.-]*:` alone also matches `example.com:8080`, so a perfectly
 * good bare host with a port was rejected as an unknown scheme. A scheme is
 * never followed by a digit, so require a non-digit after the colon.
 */
const UNKNOWN_SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Reject a normalized href the URL parser cannot make sense of. */
function isResolvable(href: string): boolean {
  try {
    // Relative hrefs need a base; absolute ones ignore it.
    void new URL(href, SITE_ORIGIN);
    return true;
  } catch {
    return false;
  }
}

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
 * catch those downstream; this is the first of the three. Note that NEITHER of
 * them catches the `/\evil.com` trap, so this function is the only guard there.
 */
export function normalizeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  // `/\evil.com` LOOKS root-relative but browsers fold the backslash to a slash
  // in the authority position, so it resolves to https://evil.com/. No article
  // href needs a backslash, and neither TipTap's isAllowedUri nor DOMPurify
  // rejects one, so this is the only place it can be caught.
  if (href.includes("\\")) return null;
  if (href.startsWith("//")) return check(`https:${href}`);
  if (href.startsWith("/") || href.startsWith("#")) return check(href);
  if (SAFE_SCHEME_RE.test(href)) return check(href);
  if (UNKNOWN_SCHEME_RE.test(href)) return null;
  return check(`https://${href}`);
}

function check(href: string): string | null {
  return isResolvable(href) ? href : null;
}

/**
 * Same-site links stay in the tab; only outbound links get target=_blank.
 *
 * Resolve against SITE_ORIGIN rather than window.location.origin: an absolute
 * https://rovno.ai/... typed while editing on localhost is still internal, and
 * the target baked into the mark ships to production. Resolving (rather than
 * pattern-matching a leading "/") also means anything that escapes the origin,
 * however it was spelled, is correctly classified as external.
 */
export function isInternalHref(href: string): boolean {
  try {
    return new URL(href, SITE_ORIGIN).origin === new URL(SITE_ORIGIN).origin;
  } catch {
    return false;
  }
}
