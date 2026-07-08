// Tag hubs: /blog/tag/<slug>/
//
// Tags are authored in Russian ("закупки"), so the URL needs a transliterated
// slug. Plain ESM because the prerenderer and the SPA must resolve a slug to the
// SAME set of posts — a static /blog/tag/zakupki/ listing three articles that the
// hydrated page then narrows to two is exactly the SSG/SPA divergence this repo
// keeps guarding against.

import { slugifyTitle } from "./slugify.mjs";

/**
 * Below this many published posts a tag page is thin content: it competes with
 * the articles it links to and bloats the index. Such pages still RESOLVE (a
 * link to them must not 404), but they are noindex and stay out of the sitemap.
 */
export const MIN_INDEXABLE_TAG_POSTS = 2;

/**
 * Russian plural form for `n`.
 *
 * Not binary: 1 статья, 2 статьи, 5 статей, 21 статья, 22 статьи, 11 статей.
 * A `n === 1 ? one : many` ternary renders "2 статей" on every tag hub.
 *
 * @param {number} n
 * @param {[string, string, string]} forms [1, 2-4, 5-20] e.g. ["статья","статьи","статей"]
 */
export function pluralizeRu(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/** URL slug for a tag. Empty when the tag transliterates to nothing ("!!!"). */
export function tagSlug(tag) {
  return slugifyTitle(tag);
}

export function tagPath(tag) {
  return `/blog/tag/${tagSlug(tag)}/`;
}

/**
 * Posts carrying a tag whose slug matches `slug`.
 *
 * Matches on the SLUG, not the tag text, so two distinct tags that transliterate
 * alike ("щи" / "shi") both answer at the same URL rather than one silently
 * shadowing the other and losing its posts.
 */
export function postsForTagSlug(posts, slug) {
  if (!slug) return [];
  return (posts ?? []).filter((post) =>
    (post.tags ?? []).some((tag) => tagSlug(tag) === slug),
  );
}

/** The tag text(s) that produce `slug`, in first-seen order. */
export function tagNamesForSlug(posts, slug) {
  const names = [];
  for (const post of posts ?? []) {
    for (const tag of post.tags ?? []) {
      if (tagSlug(tag) === slug && !names.includes(tag)) names.push(tag);
    }
  }
  return names;
}

/**
 * Every distinct tag slug across the given posts, with its display name and
 * post count. Tags that slugify to "" are dropped: they cannot have a URL.
 */
export function collectTagHubs(posts) {
  const bySlug = new Map();
  for (const post of posts ?? []) {
    for (const tag of post.tags ?? []) {
      const slug = tagSlug(tag);
      if (!slug) continue;
      const hub = bySlug.get(slug) ?? { slug, name: tag, count: 0 };
      hub.count += 1;
      bySlug.set(slug, hub);
    }
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/** A tag page earns indexing (and a sitemap entry) only once it has real depth. */
export function isIndexableTag(postCount) {
  return postCount >= MIN_INDEXABLE_TAG_POSTS;
}

/**
 * "Читать ещё": articles sharing a tag first, then the newest of the rest.
 *
 * A pillar article that only ever links to "the 3 most recent posts" never forms
 * a topic cluster — the internal links have to point at the same subject.
 * Relative order within each group is preserved (callers pass newest-first).
 *
 * @param {Array} posts    Candidate posts (newest first).
 * @param {string} slug    The current article's slug, excluded from the result.
 * @param {string[]} tags  The current article's tags.
 * @param {number} limit
 */
export function relatedPosts(posts, slug, tags, limit = 3) {
  const others = (posts ?? []).filter((post) => post.slug !== slug);
  const mine = new Set(tags ?? []);
  if (mine.size === 0) return others.slice(0, limit);

  const related = [];
  const rest = [];
  for (const post of others) {
    ((post.tags ?? []).some((tag) => mine.has(tag)) ? related : rest).push(post);
  }
  return [...related, ...rest].slice(0, limit);
}
