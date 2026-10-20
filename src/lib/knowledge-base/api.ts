// Supabase access for the knowledge base («База знаний», epic docs-library).
//
// public.kb_documents is readable by anon and authenticated (published rows only,
// RLS); nobody but service_role writes. Uses the untyped client: the generated
// contract types several columns as `unknown`, so rows are normalised here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  KB_FOLDERS,
  KB_PAGE_SIZE,
  normalizeKbRow,
  searchOrFilter,
  type KbDocumentShape,
  type KbFolder,
} from "./kbConfig.mjs";

const rawSupabase = supabase as unknown as SupabaseClient;

export type KbDocument = KbDocumentShape;

export const KB_DOCUMENT_COLUMNS =
  "doc_id, slug, designation, title, category, folder, display_mode, object_types, domains, " +
  "applicability_note, publisher, country, edition, effective_from, last_checked_at, source_links, full_text_available";

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
