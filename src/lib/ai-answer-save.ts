import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SaveAnswerTarget = { kind: "personal" } | { kind: "project"; projectId: string };

/** «Сохранить в документы» under an answer: the person's documents or a project's. */
export async function saveAnswerToDocuments(
  target: SaveAnswerTarget,
  content: string,
  profileId: string,
  defaultTitle: string,
): Promise<void> {
  const rawSupabase = supabase as unknown as SupabaseClient;
  const title = content.slice(0, 120).replace(/\n/g, " ").trim() || defaultTitle;

  if (target.kind === "personal") {
    const { error } = await rawSupabase
      .from("workspace_documents")
      .insert({
        owner_profile_id: profileId,
        title,
        type: "knowledge_base",
        origin: "ai_generated",
        description: content,
        created_by: profileId,
      });
    if (error) throw error;
    return;
  }

  const { data: docRows, error: docErr } = await rawSupabase
    .from("documents")
    .insert({
      project_id: target.projectId,
      type: "knowledge_base",
      title,
      origin: "ai_generated",
      description: content,
      created_by: profileId,
    })
    .select("id")
    .single();
  if (docErr) throw docErr;
  const newDocId = (docRows as { id: string }).id;
  const { error: verErr } = await rawSupabase
    .from("document_versions")
    .insert({
      document_id: newDocId,
      version_number: 1,
      is_current: true,
      created_by: profileId,
    });
  if (verErr) {
    // Best-effort cleanup: drop the orphan documents row so a retry
    // does not duplicate it. PostgREST does not give us a real
    // transaction across two .insert() calls; the proper fix is a
    // SECURITY DEFINER RPC that wraps both inserts in one tx
    // (tracked as a follow-up).
    await rawSupabase.from("documents").delete().eq("id", newDocId);
    throw verErr;
  }
}
