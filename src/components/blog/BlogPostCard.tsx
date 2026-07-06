import { Link } from "react-router-dom";
import { blogPostPath } from "@/lib/blog/jsonld";
import { formatReadingTime } from "@/lib/blog/reading-time";
import type { BlogPostWithAuthor } from "@/lib/blog/types";

export function formatPostDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

export function BlogPostCard({ post }: { post: BlogPostWithAuthor }) {
  const meta = [formatPostDate(post.published_at), formatReadingTime(post.reading_time_minutes)]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link to={blogPostPath(post.slug)} className="rv-blog-card">
      {post.cover_image_url ? (
        <img className="rv-blog-card__cover" src={post.cover_image_url} alt={post.title} loading="lazy" />
      ) : (
        <div className="rv-blog-card__cover--empty" aria-hidden="true">
          ровно
        </div>
      )}
      <div className="rv-blog-card__body">
        {meta && <span className="rv-blog-card__meta">{meta}</span>}
        <h3 className="rv-blog-card__title">{post.title}</h3>
        {(post.excerpt ?? post.subtitle) && (
          <p className="rv-blog-card__excerpt">{post.excerpt ?? post.subtitle}</p>
        )}
      </div>
    </Link>
  );
}
