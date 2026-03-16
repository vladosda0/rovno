import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../backend-truth/generated/supabase-types";
import type { EstimateV2Snapshot, ResourceLineType } from "@/types/estimate-v2";

type TypedSupabaseClient = SupabaseClient<Database>;
type ProjectEstimateRow = Database["public"]["Tables"]["project_estimates"]["Row"];
type ProjectEstimateInsert = Database["public"]["Tables"]["project_estimates"]["Insert"];
type ProjectEstimateUpdate = Database["public"]["Tables"]["project_estimates"]["Update"];
type EstimateVersionRow = Database["public"]["Tables"]["estimate_versions"]["Row"];
type EstimateVersionInsert = Database["public"]["Tables"]["estimate_versions"]["Insert"];
type EstimateWorkRow = Database["public"]["Tables"]["estimate_works"]["Row"];
type EstimateWorkInsert = Database["public"]["Tables"]["estimate_works"]["Insert"];
type EstimateResourceLineRow = Database["public"]["Tables"]["estimate_resource_lines"]["Row"];
type EstimateResourceLineInsert = Database["public"]["Tables"]["estimate_resource_lines"]["Insert"];
type EstimateDependencyRow = Database["public"]["Tables"]["estimate_dependencies"]["Row"];
type EstimateDependencyInsert = Database["public"]["Tables"]["estimate_dependencies"]["Insert"];
type ProjectStageRow = Database["public"]["Tables"]["project_stages"]["Row"];
type ProjectStageInsert = Database["public"]["Tables"]["project_stages"]["Insert"];

const PROJECT_ESTIMATE_SELECT = "id, project_id, title, description, status, created_by, created_at, updated_at";
const ESTIMATE_VERSION_SELECT = "id, estimate_id, version_number, is_current, created_by, created_at";
const PROJECT_STAGE_SELECT = "id, project_id, title, description, sort_order, status, discount_bps, created_at, updated_at";
const ESTIMATE_WORK_SELECT = "id, estimate_version_id, project_stage_id, title, description, sort_order, planned_cost_cents, created_at";
const ESTIMATE_RESOURCE_LINE_SELECT = "id, estimate_work_id, resource_type, title, quantity, unit, unit_price_cents, total_price_cents, created_at";
const ESTIMATE_DEPENDENCY_SELECT = "id, estimate_version_id, from_work_id, to_work_id, dependency_type, created_at";

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

export interface SaveCurrentEstimateDraftActor {
  profileId: string;
}

export interface CurrentEstimateDraft {
  estimate: ProjectEstimateRow | null;
  currentVersion: EstimateVersionRow | null;
  stages: ProjectStageRow[];
  works: EstimateWorkRow[];
  lines: EstimateResourceLineRow[];
  dependencies: EstimateDependencyRow[];
}

export interface EstimateDraftResolvedIds {
  estimateId: string;
  versionId: string;
  stageIdByLocalStageId: Record<string, string>;
  workIdByLocalWorkId: Record<string, string>;
  lineIdByLocalLineId: Record<string, string>;
  dependencyIdByLocalDependencyId: Record<string, string>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deterministicHex(seed: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x811c9dc5;
  let hashC = 0x811c9dc5;
  let hashD = 0x811c9dc5;

  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + 17;
    hashB = Math.imul(hashB, 0x01000193);
    hashC ^= code + 31;
    hashC = Math.imul(hashC, 0x01000193);
    hashD ^= code + 47;
    hashD = Math.imul(hashD, 0x01000193);
  }

  return [hashA, hashB, hashC, hashD]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function deterministicUuid(seed: string): string {
  const hex = deterministicHex(`${seed}:a`) + deterministicHex(`${seed}:b`);
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  const variant = parseInt(chars[16], 16);
  chars[16] = ["8", "9", "a", "b"][variant % 4];
  const normalized = chars.join("");

  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

function ensureRemoteUuid(projectId: string, namespace: string, value: string): string {
  if (UUID_RE.test(value)) return value;
  return deterministicUuid(`${projectId}:${namespace}:${value}`);
}

function quantityFromQtyMilli(qtyMilli: number): number {
  return Math.max(0, qtyMilli / 1_000);
}

function totalPriceCents(costUnitCents: number, qtyMilli: number): number {
  return Math.max(0, Math.round(costUnitCents * quantityFromQtyMilli(qtyMilli)));
}

function mapLineTypeToRemote(type: ResourceLineType): "material" | "labor" | "equipment" | "other" {
  if (type === "material") return "material";
  if (type === "tool") return "equipment";
  if (type === "labor" || type === "subcontractor") return "labor";
  return "other";
}

function assertUniqueExistingMatch<T>(
  matches: T[],
  message: string,
): T | null {
  if (matches.length > 1) {
    throw new Error(message);
  }

  return matches[0] ?? null;
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

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

export async function loadCurrentEstimateDraft(projectId: string): Promise<CurrentEstimateDraft> {
  const supabase = await loadSupabaseClient();

  const { data: stageRows, error: stageError } = await supabase
    .from("project_stages")
    .select(PROJECT_STAGE_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (stageError) {
    throw stageError;
  }

  const { data: estimateRows, error: estimateError } = await supabase
    .from("project_estimates")
    .select(PROJECT_ESTIMATE_SELECT)
    .eq("project_id", projectId);

  if (estimateError) {
    throw estimateError;
  }

  const estimates = estimateRows ?? [];
  if (estimates.length > 1) {
    throw new Error(`Multiple estimate roots found for project ${projectId}`);
  }

  const estimate = estimates[0] ?? null;
  if (!estimate) {
    return {
      estimate: null,
      currentVersion: null,
      stages: stageRows ?? [],
      works: [],
      lines: [],
      dependencies: [],
    };
  }

  const { data: versionRows, error: versionError } = await supabase
    .from("estimate_versions")
    .select(ESTIMATE_VERSION_SELECT)
    .eq("estimate_id", estimate.id)
    .eq("is_current", true);

  if (versionError) {
    throw versionError;
  }

  const versions = versionRows ?? [];
  if (versions.length > 1) {
    throw new Error(`Multiple current estimate versions found for project ${projectId}`);
  }

  const currentVersion = versions[0] ?? null;
  if (!currentVersion) {
    return {
      estimate,
      currentVersion: null,
      stages: stageRows ?? [],
      works: [],
      lines: [],
      dependencies: [],
    };
  }

  const { data: workRows, error: workError } = await supabase
    .from("estimate_works")
    .select(ESTIMATE_WORK_SELECT)
    .eq("estimate_version_id", currentVersion.id)
    .order("sort_order", { ascending: true });

  if (workError) {
    throw workError;
  }

  const works = workRows ?? [];
  const workIds = works.map((row) => row.id);

  let lines: EstimateResourceLineRow[] = [];
  if (workIds.length > 0) {
    const { data: lineRows, error: lineError } = await supabase
      .from("estimate_resource_lines")
      .select(ESTIMATE_RESOURCE_LINE_SELECT)
      .in("estimate_work_id", workIds);

    if (lineError) {
      throw lineError;
    }

    lines = lineRows ?? [];
  }

  const { data: dependencyRows, error: dependencyError } = await supabase
    .from("estimate_dependencies")
    .select(ESTIMATE_DEPENDENCY_SELECT)
    .eq("estimate_version_id", currentVersion.id);

  if (dependencyError) {
    throw dependencyError;
  }

  return {
    estimate,
    currentVersion,
    stages: stageRows ?? [],
    works,
    lines,
    dependencies: dependencyRows ?? [],
  };
}

export function resolveEstimateDraftRemoteIds(input: {
  projectId: string;
  snapshot: Pick<EstimateV2Snapshot, "project" | "stages" | "works" | "lines" | "dependencies">;
  existingDraft: CurrentEstimateDraft;
}): EstimateDraftResolvedIds {
  const { projectId, snapshot, existingDraft } = input;
  const estimateId = existingDraft.estimate?.id
    ?? ensureRemoteUuid(projectId, "estimate", snapshot.project.id || projectId);
  const versionId = existingDraft.currentVersion?.id
    ?? ensureRemoteUuid(projectId, "estimate-version", `${projectId}:current`);

  const stageIdByLocalStageId: Record<string, string> = {};
  snapshot.stages.forEach((stage) => {
    const directMatch = existingDraft.stages.find((row) => row.id === stage.id) ?? null;
    const naturalMatch = assertUniqueExistingMatch(
      existingDraft.stages.filter((row) => row.title === stage.title && row.sort_order === stage.order),
      `Ambiguous remote stage mapping for "${stage.title}"`,
    );
    stageIdByLocalStageId[stage.id] = directMatch?.id
      ?? naturalMatch?.id
      ?? ensureRemoteUuid(projectId, "stage", stage.id);
  });

  const workIdByLocalWorkId: Record<string, string> = {};
  snapshot.works.forEach((work) => {
    const resolvedStageId = stageIdByLocalStageId[work.stageId] ?? null;
    const directMatch = existingDraft.works.find((row) => row.id === work.id) ?? null;
    const naturalMatch = assertUniqueExistingMatch(
      existingDraft.works.filter((row) => (
        row.title === work.title
        && row.sort_order === work.order
        && (row.project_stage_id ?? null) === resolvedStageId
      )),
      `Ambiguous remote work mapping for "${work.title}"`,
    );
    workIdByLocalWorkId[work.id] = directMatch?.id
      ?? naturalMatch?.id
      ?? ensureRemoteUuid(projectId, "work", work.id);
  });

  const lineIdByLocalLineId: Record<string, string> = {};
  snapshot.lines.forEach((line) => {
    const resolvedWorkId = workIdByLocalWorkId[line.workId]
      ?? ensureRemoteUuid(projectId, "work", line.workId);
    const directMatch = existingDraft.lines.find((row) => row.id === line.id) ?? null;
    const naturalMatch = assertUniqueExistingMatch(
      existingDraft.lines.filter((row) => (
        row.estimate_work_id === resolvedWorkId
        && row.title === line.title
        && row.resource_type === mapLineTypeToRemote(line.type)
        && row.quantity === quantityFromQtyMilli(line.qtyMilli)
        && (row.unit ?? null) === (line.unit || null)
        && (row.unit_price_cents ?? 0) === line.costUnitCents
        && (row.total_price_cents ?? 0) === totalPriceCents(line.costUnitCents, line.qtyMilli)
      )),
      `Ambiguous remote estimate line mapping for "${line.title}"`,
    );
    lineIdByLocalLineId[line.id] = directMatch?.id
      ?? naturalMatch?.id
      ?? ensureRemoteUuid(projectId, "line", line.id);
  });

  const dependencyIdByLocalDependencyId: Record<string, string> = {};
  snapshot.dependencies.forEach((dependency) => {
    const resolvedFromWorkId = workIdByLocalWorkId[dependency.fromWorkId]
      ?? ensureRemoteUuid(projectId, "work", dependency.fromWorkId);
    const resolvedToWorkId = workIdByLocalWorkId[dependency.toWorkId]
      ?? ensureRemoteUuid(projectId, "work", dependency.toWorkId);
    const directMatch = existingDraft.dependencies.find((row) => row.id === dependency.id) ?? null;
    const naturalMatch = assertUniqueExistingMatch(
      existingDraft.dependencies.filter((row) => (
        row.from_work_id === resolvedFromWorkId
        && row.to_work_id === resolvedToWorkId
      )),
      "Ambiguous remote dependency mapping",
    );
    dependencyIdByLocalDependencyId[dependency.id] = directMatch?.id
      ?? naturalMatch?.id
      ?? ensureRemoteUuid(projectId, "dependency", dependency.id);
  });

  return {
    estimateId,
    versionId,
    stageIdByLocalStageId,
    workIdByLocalWorkId,
    lineIdByLocalLineId,
    dependencyIdByLocalDependencyId,
  };
}

export async function saveCurrentEstimateDraft(
  projectId: string,
  snapshot: EstimateV2Snapshot,
  actor: SaveCurrentEstimateDraftActor,
): Promise<void> {
  const supabase = await loadSupabaseClient();
  const existingDraft = await loadCurrentEstimateDraft(projectId);
  const resolvedIds = resolveEstimateDraftRemoteIds({
    projectId,
    snapshot,
    existingDraft,
  });

  const estimateResult = await ensureProjectEstimateRoot(supabase, {
    projectId,
    estimateId: resolvedIds.estimateId,
    title: snapshot.project.title,
    createdBy: actor.profileId,
  });
  if (!estimateResult.ok) {
    throw new Error(`Unable to ensure estimate root: ${estimateResult.reason}`);
  }

  const versionResult = await ensureEstimateCurrentVersion(supabase, {
    estimateId: estimateResult.row.id,
    versionId: resolvedIds.versionId,
    createdBy: actor.profileId,
  });
  if (!versionResult.ok) {
    throw new Error(`Unable to ensure estimate current version: ${versionResult.reason}`);
  }

  const rootPatch: ProjectEstimateUpdate = {
    title: snapshot.project.title,
    description: null,
  };
  const { error: rootUpdateError } = await supabase
    .from("project_estimates")
    .update(rootPatch)
    .eq("id", estimateResult.row.id);

  if (rootUpdateError) {
    throw rootUpdateError;
  }

  const stageIdByLocalId = new Map(Object.entries(resolvedIds.stageIdByLocalStageId));
  const workIdByLocalId = new Map(Object.entries(resolvedIds.workIdByLocalWorkId));
  const lineIdByLocalId = new Map(Object.entries(resolvedIds.lineIdByLocalLineId));
  const dependencyIdByLocalId = new Map(Object.entries(resolvedIds.dependencyIdByLocalDependencyId));

  const stageRows: ProjectStageInsert[] = snapshot.stages.map((stage) => ({
    id: stageIdByLocalId.get(stage.id),
    project_id: projectId,
    title: stage.title,
    description: "",
    sort_order: stage.order,
    status: "open",
    discount_bps: stage.discountBps,
  }));

  if (stageRows.length > 0) {
    const { error: stageUpsertError } = await supabase
      .from("project_stages")
      .upsert(stageRows, { onConflict: "id" });

    if (stageUpsertError) {
      throw stageUpsertError;
    }
  }

  const linesByWorkId = new Map<string, typeof snapshot.lines>();
  snapshot.lines.forEach((line) => {
    const list = linesByWorkId.get(line.workId) ?? [];
    list.push(line);
    linesByWorkId.set(line.workId, list);
  });

  const workRows: EstimateWorkInsert[] = snapshot.works.map((work) => ({
    id: workIdByLocalId.get(work.id),
    estimate_version_id: versionResult.row.id,
    project_stage_id: stageIdByLocalId.get(work.stageId) ?? null,
    title: work.title,
    description: null,
    sort_order: work.order,
    planned_cost_cents: (linesByWorkId.get(work.id) ?? []).reduce(
      (sum, line) => sum + totalPriceCents(line.costUnitCents, line.qtyMilli),
      0,
    ),
  }));

  await upsertEstimateWorks(supabase, workRows);

  const lineRows: EstimateResourceLineInsert[] = snapshot.lines.map((line) => ({
    id: lineIdByLocalId.get(line.id),
    estimate_work_id: workIdByLocalId.get(line.workId) ?? ensureRemoteUuid(projectId, "work", line.workId),
    resource_type: mapLineTypeToRemote(line.type),
    title: line.title,
    quantity: quantityFromQtyMilli(line.qtyMilli),
    unit: line.unit || null,
    unit_price_cents: line.costUnitCents,
    total_price_cents: totalPriceCents(line.costUnitCents, line.qtyMilli),
  }));

  await upsertEstimateResourceLines(supabase, lineRows);

  const dependencyRows: EstimateDependencyInsert[] = snapshot.dependencies.map((dependency) => ({
    id: dependencyIdByLocalId.get(dependency.id),
    estimate_version_id: versionResult.row.id,
    from_work_id: workIdByLocalId.get(dependency.fromWorkId) ?? ensureRemoteUuid(projectId, "work", dependency.fromWorkId),
    to_work_id: workIdByLocalId.get(dependency.toWorkId) ?? ensureRemoteUuid(projectId, "work", dependency.toWorkId),
    dependency_type: "finish_to_start",
  }));

  if (dependencyRows.length > 0) {
    const { error: dependencyUpsertError } = await supabase
      .from("estimate_dependencies")
      .upsert(dependencyRows, { onConflict: "id" });

    if (dependencyUpsertError) {
      throw dependencyUpsertError;
    }
  }

  const stageIdsToKeep = new Set(stageRows.map((row) => row.id));
  const workIdsToKeep = new Set(workRows.map((row) => row.id));
  const lineIdsToKeep = new Set(lineRows.map((row) => row.id));
  const dependencyIdsToKeep = new Set(dependencyRows.map((row) => row.id));

  const staleDependencyIds = existingDraft.dependencies
    .map((row) => row.id)
    .filter((id) => !dependencyIdsToKeep.has(id));
  if (staleDependencyIds.length > 0) {
    const { error } = await supabase
      .from("estimate_dependencies")
      .delete()
      .eq("estimate_version_id", versionResult.row.id)
      .in("id", staleDependencyIds);
    if (error) {
      throw error;
    }
  }

  const staleLineIds = existingDraft.lines
    .map((row) => row.id)
    .filter((id) => !lineIdsToKeep.has(id));
  if (staleLineIds.length > 0) {
    const { error } = await supabase
      .from("estimate_resource_lines")
      .delete()
      .in("id", staleLineIds);
    if (error) {
      throw error;
    }
  }

  const staleWorkIds = existingDraft.works
    .map((row) => row.id)
    .filter((id) => !workIdsToKeep.has(id));
  if (staleWorkIds.length > 0) {
    const { error } = await supabase
      .from("estimate_works")
      .delete()
      .eq("estimate_version_id", versionResult.row.id)
      .in("id", staleWorkIds);
    if (error) {
      throw error;
    }
  }

  const staleStageIds = existingDraft.stages
    .map((row) => row.id)
    .filter((id) => !stageIdsToKeep.has(id));
  if (staleStageIds.length > 0) {
    const { error } = await supabase
      .from("project_stages")
      .delete()
      .eq("project_id", projectId)
      .in("id", staleStageIds);
    if (error) {
      throw error;
    }
  }
}
