// Public article page — rovno.ai/blog/:slug/
//
// Prerendered at build time for crawlers; the SPA hydrates from the inlined
// post JSON when booting from a prerendered page. Drafts: RLS returns the
// row only to blog authors, so authors get a live preview at the same URL
// (with a "Черновик" badge), everyone else gets the not-found state.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDocumentHead, SITE_NAME } from "@/lib/blog/seo";
import { articleBreadcrumbTrail, articleJsonLd, blogPostPath, BLOG_TITLE } from "@/lib/blog/jsonld";
import { readPrerenderedPost } from "@/lib/blog/prerendered-data";
import { sanitizeArticleHtml } from "@/lib/blog/sanitize";
import { withHeadingAnchors } from "@/lib/blog/anchors";
import { formatReadingTime } from "@/lib/blog/reading-time";
import { useBlogPost, usePublishedBlogPosts } from "@/hooks/use-blog";
import { BlogShell, useLandingCta } from "@/components/blog/BlogShell";
import { BlogPostCard, formatPostDate } from "@/components/blog/BlogPostCard";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { relatedPosts, tagPath, tagSlug } from "@/lib/blog/tagsConfig.mjs";

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

/** "Об авторе" card. E-E-A-T: bio and avatar have existed on blog_authors since
 *  the blog shipped and were never rendered anywhere. Nothing shows when the
 *  author has no bio — an empty card is worse than no card. */
function AuthorBio({ name, bio, avatarUrl }: { name: string; bio: string | null; avatarUrl: string | null }) {
  if (!bio) return null;
  return (
    <aside className="rv-author-bio">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" width={56} height={56} loading="lazy" decoding="async" />
      ) : (
        <span className="rv-author-bio__initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      )}
      <div>
        <p className="rv-author-bio__label">Об авторе</p>
        <p className="rv-author-bio__name">{name}</p>
        <p className="rv-author-bio__text">{bio}</p>
      </div>
    </aside>
  );
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  // useMemo, NOT useState: React Router reuses this element across a :slug change, so a
  // lazy useState initializer runs exactly once — for the FIRST article. Its value then
  // seeded React Query's `initialData` for the SECOND article's key, marking that key
  // fresh (staleTime 5min) so `queryFn` never ran; `refetchOnWindowFocus: false` (App.tsx)
  // meant it never healed. Every "Читать ещё" click from a prerendered article rendered
  // the previous article's body, title and canonical under the new URL.
  //
  // readPrerenderedPost already returns undefined when its slug does not match the
  // inlined snapshot. The bug was never that it answered wrong — it was never asked again.
  const initialPost = useMemo(() => (slug ? readPrerenderedPost(slug) : undefined), [slug]);
  const { data: post, isLoading } = useBlogPost(slug, initialPost);
  // The FULL list, not the 4 newest: with a 4-row pool, relatedPosts can only
  // reorder the same 3 candidates the old `.slice(0, 3)` produced, so no cluster
  // ever forms. The "all" query key is already warm from /blog/ and the tag hubs.
  //
  // Deliberately unbounded, and NOT `usePublishedBlogPosts(50)`: `limit` is part of the
  // query key, so a cap would key off ["blog-posts","published",50] — matching neither
  // the prerendered __BLOG_LIST_DATA__ (seeded under "all") nor /blog/'s cache, and
  // forcing an extra fetch on every article view. When the blog outgrows one page, the
  // fix is a `related_posts` column or an RPC, not a client-side cap.
  const { data: morePosts } = usePublishedBlogPosts();
  const { startPath } = useLandingCta();

  // Cluster linking: articles sharing a tag come first, then the newest others.
  const readMore = useMemo(
    () => relatedPosts(morePosts ?? [], slug ?? "", post?.tags ?? [], 3),
    [morePosts, slug, post],
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
  // has rendered. In-page TOC clicks already work and are unaffected.
  //
  // Keyed on the post identity, NOT on safeHtml: safeHtml is a fresh string on
  // every React Query refetch (window refocus, etc.), and re-running this would
  // yank a reader who had scrolled down back up to the anchor. One landing per
  // article is the whole intent.
  const scrolledSlug = useRef<string | null>(null);
  useEffect(() => {
    if (!safeHtml || !post || scrolledSlug.current === post.slug) return;
    scrolledSlug.current = post.slug;

    // decodeURIComponent throws URIError on a malformed escape (#discount-50%).
    // The app has no error boundary, so an unguarded throw here unmounts the
    // whole SPA. A bad hash is simply not a target.
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;

    // After paint: the article HTML is committed but layout may not be settled.
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
    return () => cancelAnimationFrame(raf);
  }, [safeHtml, post]);

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
          <Breadcrumbs trail={articleBreadcrumbTrail(post)} />
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
              {metaLine}
              {/* A tag that transliterates to nothing has no URL — render it flat
                  rather than linking to /blog/tag//. */}
              {post.tags.map((t) =>
                tagSlug(t) ? (
                  <Link key={t} to={tagPath(t)} className="rv-tag-link">#{t}</Link>
                ) : (
                  <span key={t} className="rv-tag-link">#{t}</span>
                ),
              )}
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
          {post.author && (
            <AuthorBio name={post.author.display_name} bio={post.author.bio} avatarUrl={post.author.avatar_url} />
          )}
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
