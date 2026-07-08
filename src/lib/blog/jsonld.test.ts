// Locks the two structured-data contracts that are easy to break silently:
//  - the visible breadcrumb trail and the BreadcrumbList markup name the same
//    things (Google distrusts markup that the page does not show);
//  - FAQPage appears only when the document actually has faqItem nodes.

import { describe, expect, it } from "vitest";
import { articleBreadcrumbTrail, articleJsonLd } from "./jsonld";
import type { BlogPostWithAuthor } from "./types";

const faqItem = (q: string, a: string) => ({
  type: "faqItem",
  content: [
    { type: "faqQuestion", content: [{ type: "text", text: q }] },
    { type: "faqAnswer", content: [{ type: "paragraph", content: [{ type: "text", text: a }] }] },
  ],
});

function makePost(overrides: Partial<BlogPostWithAuthor> = {}): BlogPostWithAuthor {
  return {
    id: "1",
    author_id: "2",
    slug: "kak-vesti-smetu",
    title: "Как вести смету",
    subtitle: null,
    excerpt: "Экскерпт",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    content_html: "<p>x</p>",
    cover_image_url: null,
    seo_title: null,
    seo_description: null,
    tags: [],
    locale: "ru",
    status: "published",
    published_at: "2026-07-08T00:00:00Z",
    reading_time_minutes: 5,
    word_count: 900,
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    author: { id: "a", display_name: "Влад", avatar_url: null, bio: null },
    ...overrides,
  } as BlogPostWithAuthor;
}

function entity(post: BlogPostWithAuthor, type: string) {
  return (articleJsonLd(post) as Record<string, unknown>[]).find((e) => e["@type"] === type);
}

describe("breadcrumbs", () => {
  it("the trail is Главная → Блог Ровно → article title", () => {
    expect(articleBreadcrumbTrail(makePost()).map((e) => e.name)).toEqual([
      "Главная",
      "Блог Ровно",
      "Как вести смету",
    ]);
  });

  it("the visible trail and the BreadcrumbList markup name the same things, in order", () => {
    const post = makePost();
    const crumbs = entity(post, "BreadcrumbList") as {
      itemListElement: { position: number; name: string; item: string }[];
    };
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(
      articleBreadcrumbTrail(post).map((e) => e.name),
    );
    expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual([
      "https://rovno.ai",
      "https://rovno.ai/blog/",
      "https://rovno.ai/blog/kak-vesti-smetu/",
    ]);
  });
});

describe("FAQPage in articleJsonLd", () => {
  it("is omitted when the article has no FAQ", () => {
    expect(articleJsonLd(makePost())).toHaveLength(2);
    expect(entity(makePost(), "FAQPage")).toBeUndefined();
  });

  it("is appended when the document holds faqItem nodes", () => {
    const post = makePost({
      content: { type: "doc", content: [faqItem("Что такое Rovno?", "Операционная система.")] },
    });
    const all = articleJsonLd(post) as Record<string, unknown>[];
    expect(all.map((e) => e["@type"])).toEqual(["Article", "BreadcrumbList", "FAQPage"]);
    expect(entity(post, "FAQPage")).toMatchObject({
      mainEntity: [
        {
          "@type": "Question",
          name: "Что такое Rovno?",
          acceptedAnswer: { "@type": "Answer", text: "Операционная система." },
        },
      ],
    });
  });
});
