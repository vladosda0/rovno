// Blog row types.
//
// blog_posts / blog_authors are already in the backend-truth contract on the
// rovno-db side, but the generated Database type in this repo updates only
// via the backend-truth sync PR — until that lands, the blog feature reads
// them through the untyped client (same pattern as subscriptions/billing),
// with these interfaces as the single source of shape truth.

export interface BlogAuthor {
  id: string;
  /**
   * The user account behind the byline. NULL for a system author (Шурик,
   * rovno-db 20261016110000_blog_system_authors): exactly one of profile_id and
   * system_key is set. A null never equals a signed-in user's id, so a system
   * author can never pass the "is this me" check the admin runs.
   */
  profile_id: string | null;
  /**
   * Stable key of a system author ('shurik'), NULL for a human one. Optional
   * because fetchMyBlogAuthor does not select it: it looks the caller up by
   * profile_id, and a system author is never the caller.
   */
  system_key?: string | null;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Public byline projection embedded into post reads. */
export interface BlogPostAuthor {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

export type BlogPostStatus = "draft" | "published";

export interface BlogPost {
  id: string;
  author_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  /** TipTap document JSON — source of truth for editing. */
  content: unknown;
  /** Pre-rendered sanitized HTML — what public pages and the prerenderer emit. */
  content_html: string;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[];
  locale: "ru" | "en";
  status: BlogPostStatus;
  published_at: string | null;
  reading_time_minutes: number | null;
  word_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPostWithAuthor extends BlogPost {
  author: BlogPostAuthor | null;
}

export interface BlogPostInsert {
  author_id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  excerpt?: string | null;
  content?: unknown;
  content_html?: string;
  cover_image_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  tags?: string[];
  locale?: "ru" | "en";
  status?: BlogPostStatus;
  published_at?: string | null;
  reading_time_minutes?: number | null;
  word_count?: number | null;
}

export type BlogPostPatch = Partial<Omit<BlogPostInsert, "author_id">>;
