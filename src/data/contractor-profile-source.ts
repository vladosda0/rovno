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
}

export interface ContractorProfileData {
  display_name: string;
  contacts: ContractorProfileContacts;
  region?: string;
  specializations?: string[];
  experience_years?: number;
  avatar_url?: string;
  description?: string;
  /** Optional taxpayer id (ИНН); used later to mark verified orgs. */
  inn?: string;
  /** Server whitelists this to 'draft' | 'pending_moderation'; others ignored. */
  status?: "draft" | "pending_moderation";
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
