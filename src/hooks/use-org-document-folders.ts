import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { orgQueryKeys } from "@/hooks/use-orgs";

const rawSupabase = supabase as unknown as SupabaseClient;

export interface OrgDocumentFolder {
  id: string;
  orgId: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawFolderRow {
  id: string;
  org_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function normalize(row: RawFolderRow): OrgDocumentFolder {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FOLDERS_QUERY_KEY = ["org_document_folders"] as const;

export function useOrgDocumentFolders(orgId: string | null | undefined) {
  return useQuery({
    queryKey: [...FOLDERS_QUERY_KEY, orgId ?? null],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgDocumentFolder[]> => {
      if (!orgId) return [];
      const { data, error } = await rawSupabase
        .from("org_document_folders")
        .select("id, org_id, name, created_by, created_at, updated_at")
        .eq("org_id", orgId)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as RawFolderRow[]).map(normalize);
    },
    staleTime: 60_000,
  });
}

export function useCreateOrgDocumentFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orgId: string; name: string }) => {
      const { data, error } = await rawSupabase.rpc("create_org_document_folder", {
        p_org_id: input.orgId,
        p_name: input.name,
      });
      if (error) throw error;
      return data ? normalize(data as RawFolderRow) : null;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...FOLDERS_QUERY_KEY, variables.orgId] });
    },
  });
}

export function useRenameOrgDocumentFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { folderId: string; newName: string; orgId: string }) => {
      const { data, error } = await rawSupabase.rpc("rename_org_document_folder", {
        p_folder_id: input.folderId,
        p_new_name: input.newName,
      });
      if (error) throw error;
      return data ? normalize(data as RawFolderRow) : null;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...FOLDERS_QUERY_KEY, variables.orgId] });
    },
  });
}

export function useDeleteOrgDocumentFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { folderId: string; orgId: string }) => {
      const { error } = await rawSupabase.rpc("delete_org_document_folder", {
        p_folder_id: input.folderId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...FOLDERS_QUERY_KEY, variables.orgId] });
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.documents(variables.orgId) });
    },
  });
}

export function useMoveOrgDocumentToFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { documentId: string; folderId: string | null; orgId: string }) => {
      const { error } = await rawSupabase.rpc("move_org_document_to_folder", {
        p_document_id: input.documentId,
        p_folder_id: input.folderId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...FOLDERS_QUERY_KEY, variables.orgId] });
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.documents(variables.orgId) });
    },
  });
}
