import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../backend-truth/generated/supabase-types";

type TypedSupabaseClient = SupabaseClient<Database>;
type ProjectEstimateRow = Database["public"]["Tables"]["project_estimates"]["Row"];
type ProjectEstimateInsert = Database["public"]["Tables"]["project_estimates"]["Insert"];
type EstimateVersionRow = Database["public"]["Tables"]["estimate_versions"]["Row"];
type EstimateVersionInsert = Database["public"]["Tables"]["estimate_versions"]["Insert"];
type EstimateWorkInsert = Database["public"]["Tables"]["estimate_works"]["Insert"];
type EstimateResourceLineInsert = Database["public"]["Tables"]["estimate_resource_lines"]["Insert"];

const PROJECT_ESTIMATE_SELECT = "id, project_id, title, description, status, created_by, created_at, updated_at";
const ESTIMATE_VERSION_SELECT = "id, estimate_id, version_number, is_current, created_by, created_at";

export interface EnsureProjectEstimateRootInput {
  projectId: string;
  estimateId: string;
  title: string;
  createdBy: string;
}

export interface EnsureEstimateCurrentVersionInput {
  estimateId: string;
  versionId: string;
  createdBy: string;
}

export type EnsureProjectEstimateRootResult =
  | { ok: true; row: ProjectEstimateRow }
  | { ok: false; reason: "multiple_roots" | "root_id_mismatch" };

export type EnsureEstimateCurrentVersionResult =
  | { ok: true; row: EstimateVersionRow }
  | { ok: false; reason: "multiple_current_versions" | "current_version_id_mismatch" };

export async function ensureProjectEstimateRoot(
  supabase: TypedSupabaseClient,
  input: EnsureProjectEstimateRootInput,
): Promise<EnsureProjectEstimateRootResult> {
  const { data, error } = await supabase
    .from("project_estimates")
    .select(PROJECT_ESTIMATE_SELECT)
    .eq("project_id", input.projectId);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  if (rows.length > 1) {
    return { ok: false, reason: "multiple_roots" };
  }

  const existing = rows[0];
  if (existing) {
    if (existing.id !== input.estimateId) {
      return { ok: false, reason: "root_id_mismatch" };
    }
    return { ok: true, row: existing };
  }

  const insert: ProjectEstimateInsert = {
    id: input.estimateId,
    project_id: input.projectId,
    title: input.title,
    description: null,
    status: "draft",
    created_by: input.createdBy,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("project_estimates")
    .insert(insert)
    .select(PROJECT_ESTIMATE_SELECT)
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error("Unable to create project estimate root");
  }

  return { ok: true, row: inserted };
}

export async function ensureEstimateCurrentVersion(
  supabase: TypedSupabaseClient,
  input: EnsureEstimateCurrentVersionInput,
): Promise<EnsureEstimateCurrentVersionResult> {
  const { data, error } = await supabase
    .from("estimate_versions")
    .select(ESTIMATE_VERSION_SELECT)
    .eq("estimate_id", input.estimateId)
    .eq("is_current", true);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  if (rows.length > 1) {
    return { ok: false, reason: "multiple_current_versions" };
  }

  const existing = rows[0];
  if (existing) {
    if (existing.id !== input.versionId) {
      return { ok: false, reason: "current_version_id_mismatch" };
    }
    return { ok: true, row: existing };
  }

  const insert: EstimateVersionInsert = {
    id: input.versionId,
    estimate_id: input.estimateId,
    version_number: 1,
    is_current: true,
    created_by: input.createdBy,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("estimate_versions")
    .insert(insert)
    .select(ESTIMATE_VERSION_SELECT)
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error("Unable to create current estimate version");
  }

  return { ok: true, row: inserted };
}

export async function upsertEstimateWorks(
  supabase: TypedSupabaseClient,
  rows: EstimateWorkInsert[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("estimate_works")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function upsertEstimateResourceLines(
  supabase: TypedSupabaseClient,
  rows: EstimateResourceLineInsert[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("estimate_resource_lines")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}
