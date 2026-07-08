// URL-slug validation for blog posts.
//
// Mirrors the DB constraint blog_posts_slug_format
// (^[a-z0-9]+(-[a-z0-9]+)*$, 3..120 chars) and blog_posts_slug_reserved —
// keep the two in sync with rovno-db 20260706120000_blog_schema.sql.
//
// The transliteration itself lives in slugify.mjs so the Node-side prerenderer
// can reuse it for heading anchors without importing TypeScript.

import { BLOG_SLUG_MAX } from "./slugify.mjs";

export { slugifyTitle } from "./slugify.mjs";
export { BLOG_SLUG_MAX };

export const BLOG_RESERVED_SLUGS = [
  "admin", "new", "edit", "feed", "rss", "sitemap", "tag", "tags", "preview",
] as const;

export const BLOG_SLUG_MIN = 3;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type SlugIssue = "empty" | "too_short" | "too_long" | "format" | "reserved";

/** Validate a manually edited slug against the DB constraints. */
export function validateSlug(slug: string): SlugIssue | null {
  if (!slug) return "empty";
  if (slug.length < BLOG_SLUG_MIN) return "too_short";
  if (slug.length > BLOG_SLUG_MAX) return "too_long";
  if (!SLUG_RE.test(slug)) return "format";
  if ((BLOG_RESERVED_SLUGS as readonly string[]).includes(slug)) return "reserved";
  return null;
}
