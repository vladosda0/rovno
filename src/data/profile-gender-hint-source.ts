import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// profile_gender_hint() is not in the generated Database type (its migration is
// excluded from backend-truth), so it goes through the untyped client, the same
// way client-report-source.ts does.
const rawSupabase = supabase as unknown as SupabaseClient;

/**
 * The server's answer. `written`: Shurik's one-time hint about the gender field was written now.
 * `asked`: the person had been asked already (or has a gender), nothing written. `skipped`: no
 * name in the profile yet, so the hint waits.
 */
export type ProfileGenderHintAnswer = "written" | "asked" | "skipped";

const SETTLED_KEY_PREFIX = "profile-gender-hint-settled:";

/** `written` and `asked` settle it for good; `skipped` has to be asked again later. */
export function isProfileGenderHintSettled(profileId: string): boolean {
  if (!profileId) return false;
  try {
    return localStorage.getItem(SETTLED_KEY_PREFIX + profileId) === "1";
  } catch {
    return false;
  }
}

function rememberProfileGenderHintSettled(profileId: string): void {
  try {
    localStorage.setItem(SETTLED_KEY_PREFIX + profileId, "1");
  } catch {
    // Storage is unavailable: the next visit asks the server again, which answers `asked`.
  }
}

function readAnswer(data: unknown): ProfileGenderHintAnswer {
  if (data === "written" || data === "asked" || data === "skipped") return data;
  throw new Error(`profile_gender_hint returned ${JSON.stringify(data)}`);
}

/**
 * Asks the server for the hint, or, from the onboarding step that shows the field, records that
 * the person has seen it so that no hint follows.
 */
export async function requestProfileGenderHint(
  profileId: string,
  options: { onboarding: boolean },
): Promise<ProfileGenderHintAnswer> {
  const { data, error } = await rawSupabase.rpc("profile_gender_hint", { p_onboarding: options.onboarding });
  if (error) throw error;
  const answer = readAnswer(data);
  if (answer !== "skipped") rememberProfileGenderHintSettled(profileId);
  return answer;
}
