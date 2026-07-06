// Public blog index — rovno.ai/blog/
//
// Prerendered at build time (scripts/prerender-blog.mjs) for crawlers; at
// runtime the SPA hydrates from the inlined list data when present.

import { useMemo, useState } from "react";
import { useDocumentHead } from "@/lib/blog/seo";
import { blogIndexJsonLd, BLOG_TITLE } from "@/lib/blog/jsonld";
import { readPrerenderedList } from "@/lib/blog/prerendered-data";
import { usePublishedBlogPosts } from "@/hooks/use-blog";
import { BlogShell } from "@/components/blog/BlogShell";
import { BlogPostCard } from "@/components/blog/BlogPostCard";

const PAGE_DESCRIPTION =
  "Статьи команды Ровно о том, как вести стройку без хаоса: сметы, закупки, приёмка работ, контроль подрядчиков и ИИ на объекте.";

export default function BlogIndex() {
  const [initialList] = useState(() => readPrerenderedList());
  const { data: posts, isLoading } = usePublishedBlogPosts(undefined, initialList);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const post of posts ?? []) for (const tag of post.tags) set.add(tag);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [posts]);

  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    if (!activeTag) return posts;
    return posts.filter((post) => post.tags.includes(activeTag));
  }, [posts, activeTag]);

  useDocumentHead({
    title: `${BLOG_TITLE} — стройка без хаоса`,
    description: PAGE_DESCRIPTION,
    canonicalPath: "/blog/",
    ogType: "website",
    jsonLd: posts && posts.length > 0 ? blogIndexJsonLd(posts) : null,
  });

  return (
    <BlogShell>
      <section className="rv-section" style={{ padding: "64px 48px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 840 }}>
          <span className="rv-caption" style={{ fontSize: 12, color: "var(--rv-blue)", letterSpacing: ".02em" }}>
            БЛОГ
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 64, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--rv-blue)", margin: 0 }}>
            Разбираем, как строить ровно
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 18, lineHeight: "26px", color: "var(--rv-blue)", opacity: 0.8, maxWidth: 560, margin: 0 }}>
            {PAGE_DESCRIPTION}
          </p>
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`rv-blog-tag${activeTag === null ? " active" : ""}`}
                onClick={() => setActiveTag(null)}
              >
                Все
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`rv-blog-tag${activeTag === tag ? " active" : ""}`}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rv-section" style={{ padding: "0 48px 128px" }}>
        {isLoading ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 }}>
            Загружаем статьи…
          </p>
        ) : visiblePosts.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 }}>
            Статей пока нет — скоро появятся.
          </p>
        ) : (
          <div className="rv-cols rv-cols-3 rv-blog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            {visiblePosts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </BlogShell>
  );
}
