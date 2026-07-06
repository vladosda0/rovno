// RU → latin transliteration + URL-slug normalization for blog posts.
//
// Mirrors the DB constraint blog_posts_slug_format
// (^[a-z0-9]+(-[a-z0-9]+)*$, 3..120 chars) and blog_posts_slug_reserved —
// keep the two in sync with rovno-db 20260706120000_blog_schema.sql.

const RU_TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

export const BLOG_RESERVED_SLUGS = [
  "admin", "new", "edit", "feed", "rss", "sitemap", "tag", "tags", "preview",
] as const;

export const BLOG_SLUG_MIN = 3;
export const BLOG_SLUG_MAX = 120;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Derive a URL-safe slug from a (usually Russian) title. */
export function slugifyTitle(title: string): string {
  const transliterated = title
    .toLowerCase()
    .split("")
    .map((ch) => RU_TRANSLIT[ch] ?? ch)
    .join("");

  return transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, BLOG_SLUG_MAX)
    .replace(/-$/, "");
}

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
