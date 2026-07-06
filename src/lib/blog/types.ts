// Blog row types.
//
// blog_posts / blog_authors are already in the backend-truth contract on the
// rovno-db side, but the generated Database type in this repo updates only
// via the backend-truth sync PR — until that lands, the blog feature reads
// them through the untyped client (same pattern as subscriptions/billing),
// with these interfaces as the single source of shape truth.

export interface BlogAuthor {
  id: string;
  profile_id: string;
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
