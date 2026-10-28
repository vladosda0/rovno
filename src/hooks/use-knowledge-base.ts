// React Query hooks for the knowledge base («База знаний»). Public data: enabled
// for guests and signed-in users alike (anon RLS serves published rows).

import { useQuery, type QueryKey } from "@tanstack/react-query";
import {
  fetchKbClauses,
  fetchKbDocumentById,
  fetchKbDocumentBySlug,
  fetchKbSpFullTextEnabled,
  fetchKbDocumentPage,
  fetchKbFolderCounts,
  fetchKbSolutionBySlug,
  fetchKbSolutions,
  type KbDocument,
  type KbDocumentPageParams,
  type KbSolution,
} from "@/lib/knowledge-base/api";

const STALE = 10 * 60 * 1000;

export const kbKeys = {
  all: ["kb"] as const,
  folderCounts: () => [...kbKeys.all, "folder-counts"] as const,
  page: (params: KbDocumentPageParams) =>
    [...kbKeys.all, "page", params.folder ?? "all", params.search.trim(), params.page, params.pageSize ?? "default"] as const,
  doc: (slug: string) => [...kbKeys.all, "doc", slug] as const,
  docById: (docId: string) => [...kbKeys.all, "doc-id", docId] as const,
  clauses: (docId: string) => [...kbKeys.all, "clauses", docId] as const,
  spFullText: () => [...kbKeys.all, "sp-full-text"] as const,
  solutions: () => [...kbKeys.all, "solutions"] as const,
  solution: (slug: string) => [...kbKeys.all, "solution", slug] as const,
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

/** The SP switch (R-10). Until it loads, the full text counts as on: RLS still guards the clauses. */
export function useKbSpFullText() {
  return useQuery({
    queryKey: kbKeys.spFullText(),
    queryFn: fetchKbSpFullTextEnabled,
    staleTime: STALE,
  });
}

export function useKbClauses(docId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: kbKeys.clauses(docId ?? ""),
    queryFn: () => fetchKbClauses(docId!),
    enabled: !!docId && enabled,
    staleTime: STALE,
  });
}

/** The document that replaced this one («Вместо него: …»). */
export function useKbDocumentById(docId: string | null | undefined) {
  return useQuery({
    queryKey: kbKeys.docById(docId ?? ""),
    queryFn: () => fetchKbDocumentById(docId!),
    enabled: !!docId,
    staleTime: STALE,
  });
}

/** Published «Решения» cards (slice 4); the folder, the card page and the guest pages share one read. */
export function useKbSolutions(initialData?: KbSolution[]) {
  return useQuery({
    queryKey: kbKeys.solutions(),
    queryFn: fetchKbSolutions,
    staleTime: STALE,
    // The root of «База знаний» does not wait for the cards: one retry, then the tile stays away.
    retry: 1,
    // Prerendered /baza/resheniya/… inlines the cards (lib/knowledge-base/prerendered-data).
    initialData,
  });
}

export function useKbSolution(slug: string | undefined, initialData?: KbSolution, initialDataUpdatedAt?: number) {
  return useQuery({
    queryKey: kbKeys.solution(slug ?? ""),
    queryFn: () => fetchKbSolutionBySlug(slug!),
    enabled: !!slug,
    staleTime: STALE,
    initialData,
    initialDataUpdatedAt,
  });
}
