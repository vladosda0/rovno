// schema.org JSON-LD builders for the blog (Article / Blog / breadcrumbs).
//
// Emitted both at runtime (useDocumentHead) and — with identical shapes — by
// the build-time prerenderer (scripts/prerender-blog.mjs keeps its own copy;
// change the shapes in both places).

import { SITE_NAME, SITE_ORIGIN } from "./seo";
import type { BlogPostWithAuthor } from "./types";

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
  if (post.author) article.author = { "@type": "Person", name: post.author.display_name };
  if (post.word_count) article.wordCount = post.word_count;
  if (post.tags.length > 0) article.keywords = post.tags.join(", ");

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: BLOG_TITLE, item: `${SITE_ORIGIN}/blog/` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return [article, breadcrumbs];
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
