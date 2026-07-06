// Reads post data inlined by the build-time prerenderer.
//
// scripts/prerender-blog.mjs writes the post/list JSON into
// <script type="application/json" id="__BLOG_POST_DATA__|__BLOG_LIST_DATA__">
// inside the static blog HTML. Using it as React Query initialData lets the
// SPA paint the article instantly (no fetch flash) when it boots from a
// prerendered page; on a normal SPA navigation the tags are absent and the
// hooks fetch as usual.

import type { BlogPostWithAuthor } from "./types";

function readJsonScript<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el || el.tagName !== "SCRIPT") return null;
  try {
    return JSON.parse(el.textContent ?? "") as T;
  } catch {
    return null;
  }
}

export function readPrerenderedPost(slug: string): BlogPostWithAuthor | undefined {
  const post = readJsonScript<BlogPostWithAuthor>("__BLOG_POST_DATA__");
  return post && post.slug === slug ? post : undefined;
}

export function readPrerenderedList(): BlogPostWithAuthor[] | undefined {
  const list = readJsonScript<BlogPostWithAuthor[]>("__BLOG_LIST_DATA__");
  return Array.isArray(list) ? list : undefined;
}
