import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// contractor_profiles RPCs are not yet in the generated Database type (the
// rovno-db Session 3.2.2 migration must merge first, then the backend-truth
// sync regenerates types). Use an untyped client — same pattern as org-source.
const rawSupabase = supabase as unknown as SupabaseClient;

export interface ContractorProfileContacts {
  email?: string;
  phone?: string;
  telegram?: string;
  website?: string;
  whatsapp?: string;
  vk?: string;
  max?: string;
  youtube?: string;
}

/** Card design (rovno#282). The server drops an unknown shade or a non-web cover. */
export interface ContractorProfileAppearance {
  shade?: string;
  cover_url?: string;
  cover_preset?: string;
  show_requisites?: boolean;
}

export interface ContractorProfileData {
  display_name: string;
  contacts: ContractorProfileContacts;
  region?: string;
  specializations?: string[];
  experience_years?: number | null;
  avatar_url?: string;
  description?: string;
  /** Optional taxpayer id (ИНН); used later to mark verified orgs. */
  inn?: string;
  appearance?: ContractorProfileAppearance;
  /** Server whitelists this to 'draft' | 'pending_moderation'; others ignored. */
  status?: "draft" | "pending_moderation";
}

export interface ContractorProfile {
  id: string;
  org_id: string;
  display_name: string;
  contacts: ContractorProfileContacts;
  region: string | null;
  specializations: string[];
  experience_years: number | null;
  avatar_url: string | null;
  description: string | null;
  inn: string | null;
  appearance: ContractorProfileAppearance;
  status: string;
}

const CONTRACTOR_PROFILE_COLUMNS =
  "id, org_id, display_name, contacts, region, specializations, experience_years, avatar_url, description, inn, appearance, status";

/** The organization's single business card, or null when it has none yet. */
export async function fetchContractorProfile(orgId: string): Promise<ContractorProfile | null> {
  const { data, error } = await rawSupabase
    .from("contractor_profiles")
    .select(CONTRACTOR_PROFILE_COLUMNS)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as ContractorProfile | null) ?? null;
}

export interface CreateOrgWithProfileResult {
  org_id: string;
  profile_id: string;
}

/**
 * Solo-user Визитка flow: creates an org (+ owner membership via trigger) and a
 * draft contractor profile in one transaction. Throws with a clear message on
 * slug collision so the UI can prompt the user to edit the slug.
 */
export async function createOrgWithContractorProfile(
  orgName: string,
  orgSlug: string,
  profile: ContractorProfileData,
): Promise<CreateOrgWithProfileResult> {
  const { data, error } = await rawSupabase.rpc("create_org_with_contractor_profile", {
    p_org_name: orgName,
    p_org_slug: orgSlug,
    p_profile_data: profile,
  });
  if (error) throw error;
  return data as CreateOrgWithProfileResult;
}

/** Existing-org Визитка flow: INSERT, or UPDATE the single profile per org. */
export async function upsertContractorProfileForOrg(
  orgId: string,
  profile: ContractorProfileData,
): Promise<CreateOrgWithProfileResult> {
  const { data, error } = await rawSupabase.rpc("upsert_contractor_profile_for_org", {
    p_org_id: orgId,
    p_profile_data: profile,
  });
  if (error) throw error;
  return data as CreateOrgWithProfileResult;
}

export interface SubmitModerationResult extends CreateOrgWithProfileResult {
  status: string;
}

/** Flip a draft contractor profile to pending_moderation. */
export async function submitContractorProfileForModeration(
  orgId: string,
): Promise<SubmitModerationResult> {
  const { data, error } = await rawSupabase.rpc("submit_contractor_profile_for_moderation", {
    p_org_id: orgId,
  });
  if (error) throw error;
  return data as SubmitModerationResult;
}
