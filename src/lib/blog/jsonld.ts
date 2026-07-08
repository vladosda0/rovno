// schema.org JSON-LD builders for the blog (Article / Blog / breadcrumbs).
//
// Emitted both at runtime (useDocumentHead) and — with identical shapes — by
// the build-time prerenderer (scripts/prerender-blog.mjs keeps its own copy;
// change the shapes in both places).

import { SITE_NAME, SITE_ORIGIN } from "./seo";
import { faqJsonLdFromDoc } from "./faqConfig.mjs";
import type { BlogPostAuthor, BlogPostWithAuthor } from "./types";

export const BLOG_TITLE = "Блог Ровно";

const PUBLISHER = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_ORIGIN,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_ORIGIN}/rovno-logo.png`,
  },
};

export function blogPostPath(slug: string): string {
  return `/blog/${slug}/`;
}

export function blogPostUrl(slug: string): string {
  return `${SITE_ORIGIN}${blogPostPath(slug)}`;
}

export interface BreadcrumbEntry {
  name: string;
  /** Site-relative, so the visible <a> and the JSON-LD `item` can share it. */
  path: string;
}

/**
 * The one definition of an article's breadcrumb trail.
 *
 * Google expects the visible breadcrumb and the BreadcrumbList markup to agree;
 * if they drift, the markup is the one that gets distrusted. Both the rendered
 * nav and the JSON-LD below are built from this list so they cannot.
 */
export function articleBreadcrumbTrail(post: BlogPostWithAuthor): BreadcrumbEntry[] {
  return [
    { name: "Главная", path: "/" },
    { name: BLOG_TITLE, path: "/blog/" },
    { name: post.title, path: blogPostPath(post.slug) },
  ];
}

/** Absolute URL for a trail entry (home stays bare, matching the canonical). */
function breadcrumbItemUrl(path: string): string {
  return path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`;
}

/**
 * The article's author as a schema.org Person.
 *
 * bio and avatar already exist on blog_authors and were never surfaced anywhere.
 * Deliberately no `url`/`sameAs`: those would need columns we chose not to add,
 * and an invented profile URL is worse than an absent one.
 */
export function authorPersonJsonLd(author: BlogPostAuthor): Record<string, unknown> {
  const person: Record<string, unknown> = { "@type": "Person", name: author.display_name };
  if (author.bio) person.description = author.bio;
  if (author.avatar_url) person.image = author.avatar_url;
  return person;
}

export function articleJsonLd(post: BlogPostWithAuthor): object[] {
  const url = blogPostUrl(post.slug);
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo_description ?? post.excerpt ?? undefined,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: post.locale === "en" ? "en" : "ru-RU",
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    publisher: PUBLISHER,
  };
  if (post.cover_image_url) article.image = [post.cover_image_url];
  if (post.author) article.author = authorPersonJsonLd(post.author);
  if (post.word_count) article.wordCount = post.word_count;
  if (post.tags.length > 0) article.keywords = post.tags.join(", ");

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: articleBreadcrumbTrail(post).map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: breadcrumbItemUrl(entry.path),
    })),
  };

  // Read out of the TipTap document, not the prose: faqItem nodes make the pairs
  // explicit, so the schema can never drift from what the page actually shows.
  const faq = faqJsonLdFromDoc(post.content);

  return faq ? [article, breadcrumbs, faq] : [article, breadcrumbs];
}

export function tagPagePath(slug: string): string {
  return `/blog/tag/${slug}/`;
}

/** Breadcrumbs for a tag hub: Главная → Блог Ровно → #тег */
export function tagBreadcrumbTrail(tagName: string, slug: string): BreadcrumbEntry[] {
  return [
    { name: "Главная", path: "/" },
    { name: BLOG_TITLE, path: "/blog/" },
    { name: `#${tagName}`, path: tagPagePath(slug) },
  ];
}

/** CollectionPage + BreadcrumbList for a tag hub. */
export function tagPageJsonLd(
  tagName: string,
  slug: string,
  posts: BlogPostWithAuthor[],
): object[] {
  const url = `${SITE_ORIGIN}${tagPagePath(slug)}`;
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `#${tagName}`,
    url,
    inLanguage: "ru-RU",
    publisher: PUBLISHER,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: blogPostUrl(post.slug),
        name: post.title,
      })),
    },
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: tagBreadcrumbTrail(tagName, slug).map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: breadcrumbItemUrl(entry.path),
    })),
  };
  return [collection, breadcrumbs];
}

export function blogIndexJsonLd(posts: BlogPostWithAuthor[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: BLOG_TITLE,
    url: `${SITE_ORIGIN}/blog/`,
    inLanguage: "ru-RU",
    publisher: PUBLISHER,
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: blogPostUrl(post.slug),
      datePublished: post.published_at ?? undefined,
    })),
  };
}
