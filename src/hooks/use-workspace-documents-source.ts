import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

export interface WorkspaceDoc {
  id: string;
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

// workspace_documents is not yet in the generated Database type; use an untyped client.
const rawSupabase = supabase as unknown as SupabaseClient;

interface WorkspaceDocumentRow {
  id: string;
  title: string;
  type: string;
  origin: string;
  description: string | null;
  tags: string[] | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  visibility_class: string;
  workspace_document_versions: Array<{
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

export function useWorkspaceDocuments(profileId: string | undefined) {
  const mode = useWorkspaceMode();
  const enabled = mode.kind === "supabase" && Boolean(profileId);

  return useQuery({
    queryKey: ["workspace_documents", profileId, mode.kind],
    enabled,
    queryFn: async (): Promise<WorkspaceDoc[]> => {
      if (!profileId) return [];

      const { data, error } = await rawSupabase
        .from("workspace_documents")
        .select(`
          id, title, type, origin, description, tags, pinned, created_at, updated_at, visibility_class,
          workspace_document_versions (
            id, storage_object_id, version_number, is_current, status,
            storage_objects ( bucket, object_path, mime_type )
          )
        `)
        .eq("owner_profile_id", profileId)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as WorkspaceDocumentRow[];
      return rows.map((row) => {
        const currentVersion = row.workspace_document_versions?.find((v) => v.is_current)
          ?? row.workspace_document_versions?.[0];
        const storageObj = currentVersion?.storage_objects ?? undefined;
        return {
          id: row.id,
          title: row.title,
          type: row.type,
          origin: row.origin,
          description: row.description ?? undefined,
          tags: row.tags ?? [],
          pinned: row.pinned,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          visibilityClass: (row.visibility_class === "internal" ? "internal" : "shared_project") as "shared_project" | "internal",
          bucket: storageObj?.bucket,
          objectPath: storageObj?.object_path,
          mimeType: storageObj?.mime_type ?? undefined,
        };
      });
    },
  });
}
