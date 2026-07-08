// RU → latin transliteration + URL-slug normalization.
//
// Plain ESM (not .ts) because the build-time prerenderer
// (scripts/prerender-blog.mjs) imports it directly under Node, while the SPA
// imports it through the .d.mts type surface. Same trick as sanitizeConfig.mjs:
// one implementation, zero drift between the static snapshot and the live app.

const RU_TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

export const BLOG_SLUG_MAX = 120;

/** Derive a URL-safe slug from a (usually Russian) title or heading. */
export function slugifyTitle(title) {
  const transliterated = String(title ?? "")
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
