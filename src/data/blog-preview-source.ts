import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// get-blog-preview is a public Edge Function (verify_jwt = false) that checks
// its own HMAC token: the door (blog-shurik-door) mints one for every draft it
// writes, and Shurik's review card in Telegram carries the link. Functions are
// not part of the generated Database type, so the untyped client is used the
// same way document-share-source.ts does.
const rawSupabase = supabase as unknown as SupabaseClient;

export interface BlogPreviewAuthor {
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

/** What get-blog-preview returns under `post` for a live token. */
export interface BlogPreview {
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  /** Stored article HTML; the page re-sanitizes it before rendering. */
  content_html: string;
  cover_image_url: string | null;
  tags: string[];
  reading_time_minutes: number | null;
  word_count: number | null;
  author: BlogPreviewAuthor | null;
  status: "draft" | "published";
  updated_at: string;
  /** Public article URL once published, null while the post is a draft. */
  published_url: string | null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isAuthor(value: unknown): value is BlogPreviewAuthor {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.display_name === "string"
    && isNullableString(row.avatar_url ?? null)
    && isNullableString(row.bio ?? null);
}

/**
 * Narrow the function's answer to the fields the page renders. Optional
 * nullable fields may be absent; anything of the wrong type makes the whole
 * answer unusable, which the caller reports as "not found" rather than
 * rendering half an article.
 */
function toBlogPreview(value: unknown): BlogPreview | null {
  if (!value || typeof value !== "object") return null;
  const post = (value as Record<string, unknown>).post;
  if (!post || typeof post !== "object") return null;
  const row = post as Record<string, unknown>;
  if (typeof row.title !== "string" || typeof row.content_html !== "string") return null;
  if (row.status !== "draft" && row.status !== "published") return null;
  if (typeof row.updated_at !== "string") return null;
  const tags = row.tags ?? [];
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) return null;
  for (const key of ["subtitle", "excerpt", "cover_image_url", "published_url"] as const) {
    if (!isNullableString(row[key] ?? null)) return null;
  }
  for (const key of ["reading_time_minutes", "word_count"] as const) {
    if (!isNullableNumber(row[key] ?? null)) return null;
  }
  const rawAuthor = row.author ?? null;
  if (rawAuthor !== null && !isAuthor(rawAuthor)) return null;
  const author = rawAuthor as BlogPreviewAuthor | null;
  return {
    title: row.title,
    subtitle: (row.subtitle as string | null | undefined) ?? null,
    excerpt: (row.excerpt as string | null | undefined) ?? null,
    content_html: row.content_html,
    cover_image_url: (row.cover_image_url as string | null | undefined) ?? null,
    tags: tags as string[],
    reading_time_minutes: (row.reading_time_minutes as number | null | undefined) ?? null,
    word_count: (row.word_count as number | null | undefined) ?? null,
    author: author
      ? {
        display_name: author.display_name,
        avatar_url: author.avatar_url ?? null,
        bio: author.bio ?? null,
      }
      : null,
    status: row.status,
    updated_at: row.updated_at,
    published_url: (row.published_url as string | null | undefined) ?? null,
  };
}

function invokeFailureStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && ctx instanceof Response) {
      return ctx.status;
    }
  }
  return null;
}

/**
 * Resolve a draft preview token into the article to show.
 *
 * Returns null for every "this link does not work" answer: a malformed,
 * forged or expired token, or a post that no longer exists. The function
 * gives one 404 for all of them on purpose, and a 400 means the same thing to
 * the visitor. Anything else (network, 5xx) is thrown so the page can tell
 * "gone" from "try again".
 */
export async function fetchBlogPreview(token: string): Promise<BlogPreview | null> {
  if (!token) return null;
  const { data, error } = await rawSupabase.functions.invoke("get-blog-preview", {
    body: { token },
  });
  if (error) {
    const status = invokeFailureStatus(error);
    if (status === 404 || status === 400) return null;
    throw error instanceof Error ? error : new Error(String(error));
  }
  return toBlogPreview(data);
}
