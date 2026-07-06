// React Query hooks for the blog feature.
//
// Public reads are enabled for guests (anon RLS serves published rows);
// author/admin surfaces key off the caller's blog_authors row.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import {
  createBlogPost,
  deleteBlogPost,
  fetchAllPostsForAdmin,
  fetchMyBlogAuthor,
  fetchPostById,
  fetchPostBySlug,
  fetchPublishedPosts,
  updateBlogPost,
} from "@/lib/blog/api";
import type { BlogPostInsert, BlogPostPatch, BlogPostWithAuthor } from "@/lib/blog/types";

export function usePublishedBlogPosts(limit?: number, initialData?: BlogPostWithAuthor[]) {
  return useQuery({
    queryKey: ["blog-posts", "published", limit ?? "all"],
    queryFn: () => fetchPublishedPosts(limit),
    staleTime: 5 * 60 * 1000,
    // Prerendered pages inline the list (see lib/blog/prerendered-data) so the
    // first paint needs no fetch.
    initialData,
  });
}

export function useBlogPost(slug: string | undefined, initialData?: BlogPostWithAuthor) {
  return useQuery({
    queryKey: ["blog-post", slug],
    enabled: !!slug,
    queryFn: () => fetchPostBySlug(slug!),
    staleTime: 5 * 60 * 1000,
    initialData,
  });
}

export function useBlogPostById(id: string | undefined) {
  return useQuery({
    queryKey: ["blog-post-by-id", id],
    enabled: !!id,
    queryFn: () => fetchPostById(id!),
  });
}

/** Is the current user on the editorial allowlist (and their author row). */
export function useMyBlogAuthor() {
  const { status, profileId } = useRuntimeAuth();
  const enabled = status === "authenticated" && !!profileId;
  const query = useQuery({
    queryKey: ["blog-author", "me", profileId],
    enabled,
    queryFn: () => fetchMyBlogAuthor(profileId!),
    staleTime: 10 * 60 * 1000,
  });
  return {
    author: query.data ?? null,
    isAuthor: !!query.data,
    // Treat "signed out" as resolved (not an author); loading only while a
    // real lookup is in flight.
    isLoading: status === "loading" || (enabled && query.isLoading),
  };
}

export function useAdminBlogPosts(enabled: boolean) {
  return useQuery({
    queryKey: ["blog-posts", "admin"],
    enabled,
    queryFn: fetchAllPostsForAdmin,
  });
}

function useInvalidateBlog() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["blog-post"] });
    void queryClient.invalidateQueries({ queryKey: ["blog-post-by-id"] });
  };
}

export function useCreateBlogPost() {
  const invalidate = useInvalidateBlog();
  return useMutation({
    mutationFn: (input: BlogPostInsert) => createBlogPost(input),
    onSuccess: invalidate,
  });
}

export function useUpdateBlogPost() {
  const invalidate = useInvalidateBlog();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BlogPostPatch }) => updateBlogPost(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteBlogPost() {
  const invalidate = useInvalidateBlog();
  return useMutation({
    mutationFn: (id: string) => deleteBlogPost(id),
    onSuccess: invalidate,
  });
}
