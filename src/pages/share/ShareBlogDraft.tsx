// Draft preview of a blog article: rovno.ai/share/blog/:token
//
// Opened from Shurik's review card in Telegram, without a session, usually on
// a phone. Everything it knows comes from the get-blog-preview Edge Function
// (see data/blog-preview-source.ts); the HMAC token in the path is the only
// credential and expires after 14 days. The article is laid out exactly as
// BlogPostPage lays it out, so what Vlad approves is what readers will see.
//
// Strings are Russian in code, like every blog page (BlogPostPage, BlogShell,
// BlogEditorPage); src/locales is not involved (R-20261016-26).
//
// Not for search engines: noindex here, /share/ is disallowed in robots.txt,
// and the route is marked secret in lib/analytics.ts so the token never
// reaches Metrika. No canonical link (the static shell's is taken out, see
// useNoStaticCanonical) and no JSON-LD: the public URL of the article is
// /blog/<slug>/, and this page must never compete with it.

import { useEffect, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDocumentHead } from "@/lib/blog/seo";
import { BLOG_TITLE } from "@/lib/blog/jsonld";
import { sanitizeArticleHtml } from "@/lib/blog/sanitize";
import { withHeadingAnchors } from "@/lib/blog/anchors";
import { formatReadingTime } from "@/lib/blog/reading-time";
import { fetchBlogPreview, type BlogPreview } from "@/data/blog-preview-source";
import { BlogShell } from "@/components/blog/BlogShell";
import { formatPostDate } from "@/components/blog/BlogPostCard";
import { AuthorBio, AuthorLine } from "@/components/blog/AuthorByline";

const BLOG_PREVIEW_STALE_TIME_MS = 60_000;

type BannerTone = "draft" | "published" | "bad";

function PreviewBanner({
  tone, title, children, role = "status",
}: {
  tone: BannerTone;
  title: string;
  children?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={`rv-preview-banner rv-preview-banner--${tone}`} role={role}>
      <b className="rv-preview-banner__title">{title}</b>
      {children}
    </div>
  );
}

// published_url comes from our own function, but it still lands in an href:
// only an http(s) address is ever rendered as a link.
function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function StatusBanner({ post }: { post: BlogPreview }) {
  if (post.status === "published") {
    const href = safeHttpUrl(post.published_url);
    return (
      <PreviewBanner tone="published" title="Статья уже опубликована">
        {href && (
          <a className="rv-preview-banner__action" href={href}>
            Открыть на сайте
          </a>
        )}
      </PreviewBanner>
    );
  }
  return (
    <PreviewBanner tone="draft" title="Черновик. Читатели его ещё не видят.">
      <span>Опубликовать или поправить можно в карточке в Telegram.</span>
    </PreviewBanner>
  );
}

function PreviewSection({ children }: { children: ReactNode }) {
  return (
    <section className="rv-section" style={{ padding: "48px 48px 0" }}>
      <div className="rv-preview-banner-wrap">{children}</div>
    </section>
  );
}

/**
 * Take the static canonical out of <head> while this page is open. Caddy
 * serves dist/index.html for /share/*, and the prerenderer stamps that shell
 * with the landing's canonical (https://rovno.ai/); a noindex page must not
 * also claim to be a copy of the landing. Put back on the way out, for the
 * SPA route that comes next.
 */
function useNoStaticCanonical() {
  useEffect(() => {
    const removed = Array.from(document.head.querySelectorAll('link[rel="canonical"]'));
    removed.forEach((node) => node.remove());
    return () => {
      removed.forEach((node) => document.head.appendChild(node));
    };
  }, []);
}

export default function ShareBlogDraft() {
  const { token = "" } = useParams<{ token: string }>();
  useNoStaticCanonical();

  const query = useQuery({
    queryKey: ["blog-preview", token],
    queryFn: () => fetchBlogPreview(token),
    enabled: Boolean(token),
    staleTime: BLOG_PREVIEW_STALE_TIME_MS,
    retry: 1,
  });

  const post = query.data ?? null;

  // Same two passes as BlogPostPage, in the same order: sanitize first, then
  // anchor the headings (the ids and TOC are ours, not the author's).
  const safeHtml = useMemo(
    () => (post ? withHeadingAnchors(sanitizeArticleHtml(post.content_html)).html : ""),
    [post],
  );

  useDocumentHead({
    title: post ? `${post.title} — черновик — ${BLOG_TITLE}` : `Черновик статьи — ${BLOG_TITLE}`,
    robots: "noindex, nofollow",
  });

  if (!token || (query.isSuccess && !post)) {
    return (
      <BlogShell>
        <PreviewSection>
          <PreviewBanner tone="bad" title="Ссылка устарела или неверна.">
            <span>Свежая ссылка есть в последней карточке статьи.</span>
          </PreviewBanner>
        </PreviewSection>
        <div style={{ height: 96 }} />
      </BlogShell>
    );
  }

  if (query.isError) {
    return (
      <BlogShell>
        <PreviewSection>
          <PreviewBanner tone="bad" title="Не удалось загрузить черновик. Попробуйте ещё раз." role="alert">
            <button
              type="button"
              className="rv-preview-banner__action"
              disabled={query.isFetching}
              onClick={() => { void query.refetch(); }}
            >
              Повторить
            </button>
          </PreviewBanner>
        </PreviewSection>
        <div style={{ height: 96 }} />
      </BlogShell>
    );
  }

  if (!post) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "96px 48px", minHeight: "40vh" }} aria-busy="true">
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 }}>
            Загружаем черновик…
          </p>
        </section>
      </BlogShell>
    );
  }

  const metaLine = [formatPostDate(post.updated_at), formatReadingTime(post.reading_time_minutes)]
    .filter(Boolean)
    .join(" · ");

  return (
    <BlogShell>
      <article>
        <section className="rv-section" style={{ padding: "48px 48px 0" }}>
          <div className="rv-preview-banner-wrap">
            <StatusBanner post={post} />
          </div>
          <header className="rv-article-header">
            <span className="rv-caption" style={{ fontSize: 12, color: "var(--rv-blue)", letterSpacing: ".04em" }}>
              {metaLine}
              {/* Flat, not links: a draft's tag hub may not exist yet, and the
                  preview should not walk its reader off into the live blog. */}
              {post.tags.map((t) => (
                <span key={t} className="rv-tag-link">#{t}</span>
              ))}
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
          {/* Re-sanitized on every render, exactly like the public page. */}
          <div className="rv-article" dangerouslySetInnerHTML={{ __html: safeHtml }} />
          {post.author && (
            <AuthorBio name={post.author.display_name} bio={post.author.bio} avatarUrl={post.author.avatar_url} />
          )}
        </section>
      </article>
    </BlogShell>
  );
}
