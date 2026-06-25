import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Org tables and RPCs are not yet present in the generated Database type
// (the rovno-db Session 2 migration must merge first, then the
// backend-truth sync PR regenerates types). Until then, use an untyped
// client — same pattern as workspace_documents (see
// src/hooks/use-workspace-documents-source.ts).
const rawSupabase = supabase as unknown as SupabaseClient;

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
  isActiveContext: boolean;
}

export interface OrgDoc {
  id: string;
  orgId: string;
  title: string;
  type: string;
  origin: string;
  description?: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  visibilityClass: "shared_project" | "internal";
  bucket?: string;
  objectPath?: string;
  mimeType?: string;
  folderId: string | null;
}

interface ListUserOrganizationsRow {
  org_id: string;
  name: string;
  slug: string;
  role: string;
  member_count: number;
  is_active_context: boolean;
}

interface OrgDocumentRow {
  id: string;
  org_id: string;
  title: string;
  type: string;
  origin: string;
  description: string | null;
  tags: string[] | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  visibility_class: string;
  folder_id: string | null;
  org_document_versions: Array<{
    id: string;
    storage_object_id: string | null;
    version_number: number;
    is_current: boolean;
    status: string;
    storage_objects: {
      bucket: string;
      object_path: string;
      mime_type: string | null;
    } | null;
  }> | null;
}

function normalizeRole(role: string): OrgSummary["role"] {
  if (role === "owner" || role === "admin" || role === "member") {
    return role;
  }
  return "member";
}

export async function listUserOrganizations(): Promise<OrgSummary[]> {
  const { data, error } = await rawSupabase.rpc("list_user_organizations");
  if (error) throw error;
  const rows = (data ?? []) as ListUserOrganizationsRow[];
  return rows.map((row) => ({
    id: row.org_id,
    name: row.name,
    slug: row.slug,
    role: normalizeRole(row.role),
    memberCount: row.member_count,
    isActiveContext: row.is_active_context,
  }));
}

export async function setActiveOrgContext(orgId: string | null): Promise<void> {
  const { error } = await rawSupabase.rpc("set_active_org_context", {
    p_org_id: orgId,
  });
  if (error) throw error;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  description?: string | null;
}

/**
 * Build a unique slug candidate by appending a numeric suffix.
 * Honors the DB constraint `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$` by
 * trimming the base if necessary so `<base>-<n>` stays under 40 chars.
 */
function buildSlugCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = `-${attempt + 1}`;
  const maxBaseLen = 40 - suffix.length;
  const trimmedBase = base.length > maxBaseLen ? base.slice(0, maxBaseLen) : base;
  // Don't let a stray trailing dash from slicing combine with our suffix dash.
  const cleanedBase = trimmedBase.replace(/-+$/, "");
  return `${cleanedBase}${suffix}`;
}

const SLUG_COLLISION_MAX_ATTEMPTS = 8;

export async function createOrganization(
  ownerProfileId: string,
  input: CreateOrganizationInput,
): Promise<OrgSummary> {
  const baseSlug = input.slug.trim().toLowerCase();
  const trimmedName = input.name.trim();
  const trimmedDescription = input.description?.trim() || null;

  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < SLUG_COLLISION_MAX_ATTEMPTS; attempt++) {
    const slug = buildSlugCandidate(baseSlug, attempt);
    const { data, error } = await rawSupabase
      .from("organizations")
      .insert({
        name: trimmedName,
        slug,
        description: trimmedDescription,
        owner_profile_id: ownerProfileId,
      })
      .select("id, name, slug")
      .single();

    if (!error && data) {
      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        role: "owner",
        memberCount: 1,
        isActiveContext: false,
      };
    }

    lastError = error ?? { message: "Unable to create organization" };
    // 23505 = unique_violation. Retry with a different slug; surface anything else.
    if ((error as { code?: string } | null)?.code !== "23505") {
      throw error ?? new Error("Unable to create organization");
    }
  }

  throw new Error(
    `Could not pick a unique slug for organization after ${SLUG_COLLISION_MAX_ATTEMPTS} attempts (last error: ${lastError?.message ?? "unique violation"})`,
  );
}

export async function listOrgDocuments(orgId: string): Promise<OrgDoc[]> {
  const { data, error } = await rawSupabase
    .from("org_documents")
    .select(`
      id, org_id, title, type, origin, description, tags, pinned, created_at, updated_at, visibility_class, folder_id,
      org_document_versions (
        id, storage_object_id, version_number, is_current, status,
        storage_objects ( bucket, object_path, mime_type )
      )
    `)
    .eq("org_id", orgId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as OrgDocumentRow[];
  return rows.map((row) => {
    const currentVersion = row.org_document_versions?.find((v) => v.is_current)
      ?? row.org_document_versions?.[0];
    const storageObj = currentVersion?.storage_objects ?? undefined;
    return {
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      type: row.type,
      origin: row.origin,
      description: row.description ?? undefined,
      tags: row.tags ?? [],
      pinned: row.pinned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      visibilityClass: (row.visibility_class === "internal" ? "internal" : "shared_project") as
        | "shared_project"
        | "internal",
      bucket: storageObj?.bucket,
      objectPath: storageObj?.object_path,
      mimeType: storageObj?.mime_type ?? undefined,
      folderId: row.folder_id,
    };
  });
}

export interface ImportSource {
  kind: "workspace" | "org";
  documentIds: string[];
  visibilityClass?: "shared_project" | "internal";
}

export async function importDocumentsToProject(
  projectId: string,
  source: ImportSource,
): Promise<{ count: number }> {
  if (source.documentIds.length === 0) return { count: 0 };
  const { data, error } = await rawSupabase.rpc("import_documents_to_project", {
    p_project_id: projectId,
    p_source_kind: source.kind,
    p_source_doc_ids: source.documentIds,
    p_visibility_class: source.visibilityClass ?? "shared_project",
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string }[];
  return { count: rows.length };
}

export interface PrepareUploadInput {
  type: string;
  title: string;
  clientFilename: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;
}

export interface PrepareUploadResultRaw {
  uploadIntentId: string;
  bucket: string;
  objectPath: string;
  filename: string;
}

export async function prepareWorkspaceDocumentUpload(
  input: PrepareUploadInput,
): Promise<PrepareUploadResultRaw> {
  const { data, error } = await rawSupabase.rpc("prepare_workspace_document_upload", {
    p_type: input.type,
    p_title: input.title,
    p_client_filename: input.clientFilename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_description: input.description ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    upload_intent_id: string;
    bucket: string;
    object_path: string;
    filename: string;
  }>;
  if (rows.length === 0) throw new Error("prepare_workspace_document_upload returned no rows");
  return {
    uploadIntentId: rows[0].upload_intent_id,
    bucket: rows[0].bucket,
    objectPath: rows[0].object_path,
    filename: rows[0].filename,
  };
}

export async function finalizeWorkspaceDocumentUpload(
  uploadIntentId: string,
  type: string,
  title: string,
  description?: string,
): Promise<{ workspaceDocumentId: string | null }> {
  const { data, error } = await rawSupabase.rpc("finalize_workspace_document_upload", {
    p_upload_intent_id: uploadIntentId,
    p_type: type,
    p_title: title,
    p_description: description ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ workspace_document_id: string }>;
  return { workspaceDocumentId: rows[0]?.workspace_document_id ?? null };
}

/**
 * Flag a workspace document as awaiting public publication. Used by the
 * catalog/template Public upload path so Session 6/7 ingest can pick it up.
 * Allowed under the workspace_docs_owner_write RLS policy (owner edits own row).
 */
export async function markWorkspaceDocumentPendingPublic(
  workspaceDocumentId: string,
): Promise<void> {
  const { error } = await rawSupabase
    .from("workspace_documents")
    .update({ pending_public_publication: true })
    .eq("id", workspaceDocumentId);
  if (error) throw error;
}

export async function prepareOrgDocumentUpload(
  orgId: string,
  input: PrepareUploadInput,
): Promise<PrepareUploadResultRaw> {
  const { data, error } = await rawSupabase.rpc("prepare_org_document_upload", {
    p_org_id: orgId,
    p_type: input.type,
    p_title: input.title,
    p_client_filename: input.clientFilename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_description: input.description ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    upload_intent_id: string;
    bucket: string;
    object_path: string;
    filename: string;
  }>;
  if (rows.length === 0) throw new Error("prepare_org_document_upload returned no rows");
  return {
    uploadIntentId: rows[0].upload_intent_id,
    bucket: rows[0].bucket,
    objectPath: rows[0].object_path,
    filename: rows[0].filename,
  };
}

export async function finalizeOrgDocumentUpload(
  uploadIntentId: string,
  type: string,
  title: string,
  description?: string,
): Promise<void> {
  const { error } = await rawSupabase.rpc("finalize_org_document_upload", {
    p_upload_intent_id: uploadIntentId,
    p_type: type,
    p_title: title,
    p_description: description ?? null,
  });
  if (error) throw error;
}

export async function uploadFileToBucket(
  bucket: string,
  objectPath: string,
  file: File,
  options?: { upsert?: boolean },
): Promise<void> {
  const { error } = await rawSupabase.storage
    .from(bucket)
    .upload(objectPath, file, {
      upsert: options?.upsert ?? false,
      contentType: file.type || undefined,
    });
  if (error) throw error;
}

export async function deleteOrganization(orgId: string): Promise<void> {
  const { error } = await rawSupabase.from("organizations").delete().eq("id", orgId);
  if (error) throw error;
}

/**
 * Slug suggestion from a free-text name.
 * Mirrors the DB constraint: ^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$
 */
export function suggestOrgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!base) return "team";
  // Constraint requires both first and last char alphanumeric and length >= 2.
  const trimmed = base.replace(/^-+|-+$/g, "");
  if (trimmed.length < 2) return `${trimmed}-1`;
  return trimmed;
}

export const ORG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export function isValidOrgSlug(slug: string): boolean {
  return ORG_SLUG_PATTERN.test(slug);
}

/**
 * Profile IDs of all members of the given org. RLS lets any org member
 * read fellow members. Used by ProjectParticipants to show an "also in
 * our org" tag without a new RPC.
 */
export async function listOrgMemberProfileIds(orgId: string): Promise<string[]> {
  const { data, error } = await rawSupabase
    .from("org_members")
    .select("profile_id")
    .eq("org_id", orgId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ profile_id: string }>;
  return rows.map((row) => row.profile_id);
}

export interface AddOrgMembersByEmailResult {
  added: string[];
  notFound: string[];
}

/**
 * Resolve emails to profiles and add each as a role='member' org_member.
 * Profiles must exist in the system; unmatched emails are returned in
 * notFound so the caller can surface a warning. Existing memberships are
 * preserved (insert is idempotent via on conflict do nothing).
 */
export async function addOrgMembersByEmail(
  orgId: string,
  emails: string[],
): Promise<AddOrgMembersByEmailResult> {
  const cleaned = Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
  if (cleaned.length === 0) return { added: [], notFound: [] };

  const { data, error } = await rawSupabase
    .from("profiles")
    .select("id, email")
    .in("email", cleaned);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; email: string }>;
  const foundByEmail = new Map(
    rows.map((row) => [row.email.toLowerCase(), row.id] as const),
  );
  const notFound = cleaned.filter((email) => !foundByEmail.has(email));

  if (foundByEmail.size > 0) {
    const inserts = Array.from(foundByEmail.values()).map((profileId) => ({
      org_id: orgId,
      profile_id: profileId,
      role: "member" as const,
    }));
    const { error: insertError } = await rawSupabase
      .from("org_members")
      .upsert(inserts, { onConflict: "org_id,profile_id", ignoreDuplicates: true });
    if (insertError) throw insertError;
  }

  return {
    added: Array.from(foundByEmail.keys()),
    notFound,
  };
}

