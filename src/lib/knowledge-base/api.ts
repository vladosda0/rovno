// Supabase access for the knowledge base («База знаний», epic docs-library).
//
// public.kb_documents is readable by anon and authenticated (published rows only,
// RLS); nobody but service_role writes. Uses the untyped client: the generated
// contract types several columns as `unknown`, so rows are normalised here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizeKbClause, type KbClause } from "./kbFullText.mjs";
import {
  KB_FOLDERS,
  KB_PAGE_SIZE,
  normalizeKbRow,
  searchOrFilter,
  type KbDocumentShape,
  type KbFolder,
} from "./kbConfig.mjs";
import { KB_SOLUTION_SELECT, normalizeKbSolution, sortKbSolutions, type KbSolution } from "./kbSolutions.mjs";

const rawSupabase = supabase as unknown as SupabaseClient;

export type KbDocument = KbDocumentShape;
export type { KbClause, KbSolution };

export const KB_DOCUMENT_COLUMNS =
  "doc_id, slug, designation, title, category, folder, display_mode, object_types, domains, " +
  "applicability_note, publisher, country, edition, effective_from, last_checked_at, source_links, full_text_available, " +
  "doc_status, doc_status_since, replaced_by, edition_date, text_checked_at, text_source_url, text_pdf_url, " +
  "text_label, text_base_year, applied_amendments, pending_amendments, recognized_from_scan, upcoming_amendments, " +
  "text_unavailable_reason";

const FOLDER_SET: ReadonlySet<string> = new Set(KB_FOLDERS);

export function normalizeKbDocument(row: Record<string, unknown>): KbDocument {
  return normalizeKbRow(row);
}

/** Published documents per folder, from kb_folder_counts(). Missing folders read as 0. */
export async function fetchKbFolderCounts(): Promise<Record<KbFolder, number>> {
  const { data, error } = await rawSupabase.rpc("kb_folder_counts");
  if (error) throw error;
  const counts = Object.fromEntries(KB_FOLDERS.map((f) => [f, 0])) as Record<KbFolder, number>;
  for (const row of (data ?? []) as Array<{ folder?: unknown; documents?: unknown }>) {
    if (typeof row.folder === "string" && FOLDER_SET.has(row.folder)) {
      counts[row.folder as KbFolder] = Number(row.documents) || 0;
    }
  }
  return counts;
}

export interface KbDocumentPageParams {
  folder: KbFolder | null;
  search: string;
  page: number;
  pageSize?: number;
}

export interface KbDocumentPage {
  rows: KbDocument[];
  total: number;
}

/** One server-side page, ordered by designation then title. */
export async function fetchKbDocumentPage({
  folder,
  search,
  page,
  pageSize = KB_PAGE_SIZE,
}: KbDocumentPageParams): Promise<KbDocumentPage> {
  const from = page * pageSize;
  let query = rawSupabase
    .from("kb_documents")
    .select(KB_DOCUMENT_COLUMNS, { count: "exact" })
    .eq("is_published", true);
  if (folder) query = query.eq("folder", folder);
  const filter = searchOrFilter(search);
  if (filter) query = query.or(filter);
  const { data, error, count } = await query
    .order("designation", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true })
    // Stable paging: designation+title can tie, so doc_id breaks the tie.
    .order("doc_id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeKbDocument);
  return { rows, total: count ?? rows.length };
}

export async function fetchKbDocumentBySlug(slug: string): Promise<KbDocument | null> {
  const { data, error } = await rawSupabase
    .from("kb_documents")
    .select(KB_DOCUMENT_COLUMNS)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeKbDocument(data as unknown as Record<string, unknown>) : null;
}

export async function fetchKbDocumentById(docId: string): Promise<KbDocument | null> {
  const { data, error } = await rawSupabase
    .from("kb_documents")
    .select(KB_DOCUMENT_COLUMNS)
    .eq("doc_id", docId)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeKbDocument(data as unknown as Record<string, unknown>) : null;
}

/** PostgREST caps one response at 1000 rows; a long СП (СП 30: 450 clauses) fits, a code may not. */
const CLAUSE_PAGE = 1000;

/**
 * Published clauses of one document in reading order (slice 2). RLS returns
 * none while the SP switch is off or the document has no full text.
 */
export async function fetchKbClauses(docId: string): Promise<KbClause[]> {
  const out: KbClause[] = [];
  for (let from = 0; ; from += CLAUSE_PAGE) {
    const { data, error } = await rawSupabase
      .from("kb_clauses")
      .select("anchor, number, level, heading, body, position, amendments")
      .eq("doc_id", docId)
      .order("position", { ascending: true })
      .range(from, from + CLAUSE_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(normalizeKbClause));
    if (rows.length < CLAUSE_PAGE) return out;
  }
}

/** The SP full-text switch (R-10). Only JSON true is on, like kb_sp_full_text_enabled(). */
export async function fetchKbSpFullTextEnabled(): Promise<boolean> {
  const { data, error } = await rawSupabase
    .from("kb_settings")
    .select("value")
    .eq("key", "sp_full_text")
    .maybeSingle();
  if (error) throw error;
  return (data as { value?: unknown } | null)?.value === true;
}

/**
 * Published «Решения» cards with their facts (slice 4). A handful of rows, so
 * the folder filters and pages them in the browser. RLS returns published
 * cards only; the SP switch does not touch them (decision 12.10).
 */
export async function fetchKbSolutions(): Promise<KbSolution[]> {
  const { data, error } = await rawSupabase
    .from("kb_solutions")
    .select(KB_SOLUTION_SELECT)
    .eq("status", "published")
    .order("title", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return sortKbSolutions(rows.map(normalizeKbSolution).filter((s) => s.slug && s.title));
}

export async function fetchKbSolutionBySlug(slug: string): Promise<KbSolution | null> {
  const { data, error } = await rawSupabase
    .from("kb_solutions")
    .select(KB_SOLUTION_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeKbSolution(data as unknown as Record<string, unknown>) : null;
}

/** History rows for the «Сведения / История» window of a document (slice 7, `kb_document_history`). */
export async function fetchKbDocumentHistory(slug: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await rawSupabase.rpc("kb_document_history", { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

/** History rows for the same window on a solution card (`kb_solution_history`). */
export async function fetchKbSolutionHistory(slug: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await rawSupabase.rpc("kb_solution_history", { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

/** «Что изменилось» (slice 8, `kb_changes_feed`): newest first, readable by guests. */
export async function fetchKbChangesFeed(limit = 300): Promise<Record<string, unknown>[]> {
  const { data, error } = await rawSupabase.rpc("kb_changes_feed", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

/** Lines of the current month, for «За ноябрь: 3» under the tile (`kb_changes_month_count`). */
export async function fetchKbChangesMonthCount(): Promise<number> {
  const { data, error } = await rawSupabase.rpc("kb_changes_month_count");
  if (error) throw error;
  return Number(data) || 0;
}

/** Whether the signed-in person follows the document (`kb_watching`; false for a guest). */
export async function fetchKbWatching(slug: string): Promise<boolean> {
  const { data, error } = await rawSupabase.rpc("kb_watching", { p_slug: slug });
  if (error) throw error;
  return data === true;
}

/** Follows or stops following; the server answers with the state after (`kb_watch_set`). */
export async function setKbWatch(slug: string, watch: boolean): Promise<boolean> {
  const { data, error } = await rawSupabase.rpc("kb_watch_set", { p_slug: slug, p_watch: watch });
  if (error) throw error;
  return data === true;
}
