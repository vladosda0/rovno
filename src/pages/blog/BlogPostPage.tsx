// Public article page — rovno.ai/blog/:slug/
//
// Prerendered at build time for crawlers; the SPA hydrates from the inlined
// post JSON when booting from a prerendered page. Drafts: RLS returns the
// row only to blog authors, so authors get a live preview at the same URL
// (with a "Черновик" badge), everyone else gets the not-found state.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDocumentHead, SITE_NAME } from "@/lib/blog/seo";
import { articleJsonLd, blogPostPath, BLOG_TITLE } from "@/lib/blog/jsonld";
import { readPrerenderedPost } from "@/lib/blog/prerendered-data";
import { sanitizeArticleHtml } from "@/lib/blog/sanitize";
import { withHeadingAnchors } from "@/lib/blog/anchors";
import { formatReadingTime } from "@/lib/blog/reading-time";
import { useBlogPost, usePublishedBlogPosts } from "@/hooks/use-blog";
import { BlogShell, useLandingCta } from "@/components/blog/BlogShell";
import { BlogPostCard, formatPostDate } from "@/components/blog/BlogPostCard";

function AuthorLine({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: 36, height: 36, borderRadius: 999, objectFit: "cover" }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: 999, background: "rgba(30,92,203,0.1)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontSize: 16, color: "var(--rv-blue)",
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--rv-blue)" }}>{name}</span>
    </div>
  );
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [initialPost] = useState(() => (slug ? readPrerenderedPost(slug) : undefined));
  const { data: post, isLoading } = useBlogPost(slug, initialPost);
  const { data: morePosts } = usePublishedBlogPosts(4);
  const { startPath } = useLandingCta();

  const readMore = useMemo(
    () => (morePosts ?? []).filter((p) => p.slug !== slug).slice(0, 3),
    [morePosts, slug],
  );

  // Sanitize first, anchor second: the anchor pass adds ids and a TOC that are
  // ours, not the author's, so they must not be handed to DOMPurify as if they
  // came from the DB — and DOMPurify must never see them as something to strip.
  const safeHtml = useMemo(
    () => (post ? withHeadingAnchors(sanitizeArticleHtml(post.content_html)).html : ""),
    [post],
  );

  // Land a #deep-link that arrived with the URL.
  //
  // The browser tries to scroll while parsing the static HTML, but React then
  // replaces #root wholesale (createRoot, not hydrateRoot), so the target it
  // scrolled to no longer exists. On a draft or a post published since the last
  // Timeweb rebuild there is no static snapshot at all and the heading simply is
  // not in the DOM at load time. Either way, re-apply the hash once the article
  // has committed. In-page TOC clicks already work and are unaffected.
  useEffect(() => {
    if (!safeHtml) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    // After paint: the article HTML is committed but layout may not be settled.
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
    return () => cancelAnimationFrame(raf);
  }, [safeHtml]);

  useDocumentHead(
    post
      ? {
          title: `${post.seo_title ?? post.title} — ${BLOG_TITLE}`,
          description: post.seo_description ?? post.excerpt,
          canonicalPath: blogPostPath(post.slug),
          ogType: "article",
          ogImage: post.cover_image_url,
          article: {
            publishedTime: post.published_at ?? post.created_at,
            modifiedTime: post.updated_at,
            authorName: post.author?.display_name,
            tags: post.tags,
          },
          jsonLd: post.status === "published" ? articleJsonLd(post) : null,
          robots: post.status === "draft" ? "noindex, nofollow" : undefined,
        }
      : null,
  );

  if (isLoading) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "96px 48px", minHeight: "40vh" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 }}>
            Загружаем статью…
          </p>
        </section>
      </BlogShell>
    );
  }

  if (!post) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "128px 48px", display: "flex", flexDirection: "column", gap: 24, alignItems: "center", textAlign: "center", minHeight: "40vh" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 48, lineHeight: 1, color: "var(--rv-blue)", margin: 0 }}>
            Статья не найдена
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.72, margin: 0 }}>
            Возможно, она ещё не опубликована или адрес изменился.
          </p>
          <Link className="rv-btn rv-btn--secondary" to="/blog/">
            Все статьи
          </Link>
        </section>
      </BlogShell>
    );
  }

  const metaLine = [formatPostDate(post.published_at ?? post.created_at), formatReadingTime(post.reading_time_minutes)]
    .filter(Boolean)
    .join(" · ");

  return (
    <BlogShell>
      <article>
        <section className="rv-section" style={{ padding: "64px 48px 0" }}>
          <header className="rv-article-header">
            {post.status === "draft" && (
              <span
                className="rv-caption"
                style={{ background: "var(--rv-orange)", color: "var(--rv-cream)", borderRadius: 999, padding: "6px 14px", fontSize: 11, letterSpacing: ".08em" }}
              >
                ЧЕРНОВИК — ВИДЕН ТОЛЬКО АВТОРАМ
              </span>
            )}
            <span className="rv-caption" style={{ fontSize: 12, color: "var(--rv-blue)", letterSpacing: ".04em" }}>
              {[metaLine, ...post.tags.map((t) => `#${t}`)].filter(Boolean).join("   ")}
            </span>
            <h1 className="rv-article-title">{post.title}</h1>
            {post.subtitle && <p className="rv-article-subtitle">{post.subtitle}</p>}
            {post.author && <AuthorLine name={post.author.display_name} avatarUrl={post.author.avatar_url} />}
          </header>
          {post.cover_image_url && (
            <div className="rv-article-cover">
              <img src={post.cover_image_url} alt={post.title} />
            </div>
          )}
        </section>

        <section className="rv-section" style={{ padding: "48px 48px 96px" }}>
          {/* content_html is authored in our TipTap editor and re-sanitized on
              every render (sanitizeArticleHtml) before hitting the DOM. */}
          <div className="rv-article" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </section>
      </article>

      <section className="rv-section blue" style={{ padding: "96px 48px", display: "flex", flexDirection: "column", gap: 32, alignItems: "center", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 48, lineHeight: 1, letterSpacing: "-0.03em", margin: 0, maxWidth: 720 }}>
          Стройка, которая идёт ровно
        </h2>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 18, lineHeight: "26px", opacity: 0.88, maxWidth: 520, margin: 0 }}>
          {SITE_NAME} собирает смету, задачи, закупки и фотофиксацию в одном месте — попробуйте на своём проекте.
        </p>
        <Link className="rv-btn rv-btn--primary" to={startPath}>
          Начать проект
        </Link>
      </section>

      {readMore.length > 0 && (
        <section className="rv-section" style={{ padding: "96px 48px 128px", display: "flex", flexDirection: "column", gap: 48 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--rv-blue)", margin: 0 }}>
            Читать ещё
          </h2>
          <div className="rv-cols rv-cols-3 rv-blog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            {readMore.map((p) => (
              <BlogPostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </BlogShell>
  );
}
