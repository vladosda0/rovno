// Tag hub — rovno.ai/blog/tag/<slug>/
//
// The cluster half of a pillar/cluster blog: every article's tags link here, and
// this page links back out to the whole cluster. Prerendered for crawlers.
//
// Thin-content rule: a tag with fewer than MIN_INDEXABLE_TAG_POSTS published
// posts still RESOLVES (an inbound link must never 404) but is noindex and stays
// out of the sitemap — it would otherwise compete with the very articles it
// links to.

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDocumentHead } from "@/lib/blog/seo";
import { BLOG_TITLE, tagBreadcrumbTrail, tagPageJsonLd, tagPagePath } from "@/lib/blog/jsonld";
import { readPrerenderedList } from "@/lib/blog/prerendered-data";
import { usePublishedBlogPosts } from "@/hooks/use-blog";
import { isIndexableTag, pluralizeRu, postsForTagSlug, tagNamesForSlug } from "@/lib/blog/tagsConfig.mjs";
import { BlogShell } from "@/components/blog/BlogShell";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";

export default function BlogTagPage() {
  const { tag: slug = "" } = useParams<{ tag: string }>();
  const [initialList] = useState(() => readPrerenderedList());
  const { data: posts, isLoading } = usePublishedBlogPosts(undefined, initialList);

  const tagPosts = useMemo(() => postsForTagSlug(posts ?? [], slug), [posts, slug]);
  // Two tags can transliterate alike; show every name that answers at this URL.
  const names = useMemo(() => tagNamesForSlug(posts ?? [], slug), [posts, slug]);
  const displayName = names[0] ?? slug;
  const indexable = isIndexableTag(tagPosts.length);

  useDocumentHead({
    title: `#${displayName} — ${BLOG_TITLE}`,
    description: `Статьи Ровно по теме «${displayName}»: ${tagPosts.length} ${pluralizeRu(tagPosts.length, ["материал", "материала", "материалов"])}.`,
    canonicalPath: tagPagePath(slug),
    ogType: "website",
    // Thin or empty tag pages must not enter the index.
    robots: indexable ? undefined : "noindex, follow",
    jsonLd: indexable ? tagPageJsonLd(displayName, slug, tagPosts) : null,
  });

  if (isLoading) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "96px 48px", minHeight: "40vh" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 }}>
            Загружаем статьи…
          </p>
        </section>
      </BlogShell>
    );
  }

  return (
    <BlogShell>
      <section className="rv-section" style={{ padding: "64px 48px 40px" }}>
        <Breadcrumbs trail={tagBreadcrumbTrail(displayName, slug)} />
        <span className="rv-caption" style={{ fontSize: 12, color: "var(--rv-blue)" }}>ТЕМА</span>
        <h1
          style={{
            fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-0.03em",
            color: "var(--rv-blue)", margin: "16px 0 0",
          }}
        >
          #{displayName}
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--rv-blue)", opacity: 0.8, marginTop: 12 }}>
          {tagPosts.length > 0
            ? `${tagPosts.length} ${pluralizeRu(tagPosts.length, ["статья", "статьи", "статей"])} по этой теме`
            : "Пока нет статей по этой теме"}
        </p>
      </section>

      <section className="rv-section" style={{ padding: "0 48px 128px" }}>
        {tagPosts.length > 0 ? (
          <div className="rv-blog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            {tagPosts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <Link className="rv-btn rv-btn--secondary" to="/blog/">
            Все статьи
          </Link>
        )}
      </section>
    </BlogShell>
  );
}
