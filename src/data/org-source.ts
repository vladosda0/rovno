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

export async function createOrganization(
  ownerProfileId: string,
  input: CreateOrganizationInput,
): Promise<OrgSummary> {
  const { data, error } = await rawSupabase
    .from("organizations")
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      owner_profile_id: ownerProfileId,
    })
    .select("id, name, slug")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create organization");
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    role: "owner",
    memberCount: 1,
    isActiveContext: false,
  };
}

export async function listOrgDocuments(orgId: string): Promise<OrgDoc[]> {
  const { data, error } = await rawSupabase
    .from("org_documents")
    .select(`
      id, org_id, title, type, origin, description, tags, pinned, created_at, updated_at, visibility_class,
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
    };
  });
}

export interface ImportSource {
  kind: "workspace" | "org";
  documentIds: string[];
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
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string }[];
  return { count: rows.length };
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

