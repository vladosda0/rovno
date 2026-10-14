import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ShurikHintOfDay, ShurikHintParams, ShurikHintStatus } from "@/lib/shurik-hints";

// shurik_hint_of_day() and dismiss_shurik_hint() are not in the generated Database type until the
// database part of slice 8 is merged, so they go through the untyped client, the same way
// profile-gender-hint-source.ts does.
const rawSupabase = supabase as unknown as SupabaseClient;

const STATUSES: ReadonlySet<string> = new Set<ShurikHintStatus>(["active", "done", "dismissed"]);

/** The server's answer, checked: anything that is not a hint of the day reads as "no hint". */
export function readShurikHintOfDay(data: unknown): ShurikHintOfDay | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.hint_key !== "string" || record.hint_key === "") return null;
  if (typeof record.status !== "string" || !STATUSES.has(record.status)) return null;
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params)
    ? (record.params as ShurikHintParams)
    : {};
  return {
    day: typeof record.day === "string" ? record.day : "",
    hint_key: record.hint_key,
    level: typeof record.level === "number" ? record.level : 4,
    params,
    status: record.status as ShurikHintStatus,
  };
}

/** Today's hint for this person in this project; null when there is none to show. */
export async function fetchShurikHintOfDay(projectId: string): Promise<ShurikHintOfDay | null> {
  const { data, error } = await rawSupabase.rpc("shurik_hint_of_day", { p_project_id: projectId });
  if (error) throw error;
  return readShurikHintOfDay(data);
}

/** Closes today's hint in this project until tomorrow. */
export async function dismissShurikHint(projectId: string): Promise<void> {
  const { error } = await rawSupabase.rpc("dismiss_shurik_hint", { p_project_id: projectId });
  if (error) throw error;
}
