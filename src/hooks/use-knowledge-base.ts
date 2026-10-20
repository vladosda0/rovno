// React Query hooks for the knowledge base («База знаний»). Public data: enabled
// for guests and signed-in users alike (anon RLS serves published rows).

import { useQuery, type QueryKey } from "@tanstack/react-query";
import {
  fetchKbDocumentBySlug,
  fetchKbDocumentPage,
  fetchKbFolderCounts,
  type KbDocument,
  type KbDocumentPageParams,
} from "@/lib/knowledge-base/api";

const STALE = 10 * 60 * 1000;

export const kbKeys = {
  all: ["kb"] as const,
  folderCounts: () => [...kbKeys.all, "folder-counts"] as const,
  page: (params: KbDocumentPageParams) =>
    [...kbKeys.all, "page", params.folder ?? "all", params.search.trim(), params.page, params.pageSize ?? "default"] as const,
  doc: (slug: string) => [...kbKeys.all, "doc", slug] as const,
};

export function useKbFolderCounts() {
  return useQuery({
    queryKey: kbKeys.folderCounts(),
    queryFn: fetchKbFolderCounts,
    staleTime: STALE,
  });
}

/**
 * Same folder, search and page size, i.e. only the page number differs. Turning
 * a page keeps the current tiles up while the next page loads; entering another
 * folder or changing the query must show loading, never the old folder's rows.
 */
export function samePageScope(previous: QueryKey | undefined, next: QueryKey): boolean {
  if (!previous || previous.length !== next.length) return false;
  return previous.every((part, i) => i === 4 || part === next[i]);
}

export function useKbDocumentPage(params: KbDocumentPageParams, enabled = true) {
  const queryKey = kbKeys.page(params);
  return useQuery({
    queryKey,
    queryFn: () => fetchKbDocumentPage(params),
    enabled,
    staleTime: STALE,
    placeholderData: (previousData, previousQuery) =>
      samePageScope(previousQuery?.queryKey, queryKey) ? previousData : undefined,
  });
}

export function useKbDocument(slug: string | undefined, initialData?: KbDocument) {
  return useQuery({
    queryKey: kbKeys.doc(slug ?? ""),
    queryFn: () => fetchKbDocumentBySlug(slug!),
    enabled: !!slug,
    staleTime: STALE,
    // Prerendered /baza/<slug>/ inlines the row (lib/knowledge-base/prerendered-data).
    initialData,
  });
}
