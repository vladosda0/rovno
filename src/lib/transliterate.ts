/**
 * Cyrillic → Latin transliteration and slug generation for org slugs.
 *
 * The org slug must satisfy the DB constraint
 *   ^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$
 * (2–40 chars, lowercase alphanumerics and hyphens, alnum at both ends).
 *
 * `suggestOrgSlug` in org-source.ts only does NFKD normalization, which leaves
 * Cyrillic untouched (e.g. "Студень" → "team"). This module transliterates
 * first so the slug is meaningful.
 */

/**
 * Table-based Russian → Latin map. Keys are lowercase; uppercase is handled by
 * lowercasing the input first.
 *   ж→zh, й→y, х→kh, ц→ts, ч→ch, ш→sh, щ→shch, ю→yu, я→ya
 *   ъ and ь are dropped.
 */
const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

/** Transliterate Cyrillic characters to Latin; non-Cyrillic passes through. */
export function transliterateCyrillic(input: string): string {
  let out = "";
  for (const char of input.toLowerCase()) {
    out += char in CYRILLIC_MAP ? CYRILLIC_MAP[char] : char;
  }
  return out;
}

export const ORG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export function isValidOrgSlug(slug: string): boolean {
  return ORG_SLUG_PATTERN.test(slug);
}

/**
 * Build a slug candidate from a free-text (often Cyrillic) name.
 * Transliterates, lowercases, replaces non-alphanumerics with hyphens,
 * collapses repeats, trims hyphens, and clamps to the 2–40 char constraint.
 * Returns "" when the name has no usable characters so the caller can decide
 * how to surface the empty state.
 */
export function slugifyOrgName(name: string): string {
  const base = transliterateCyrillic(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (base.length < 2) return "";
  return base;
}
