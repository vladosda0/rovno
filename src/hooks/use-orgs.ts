import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOrganization,
  deleteOrganization,
  importDocumentsToProject,
  listOrgDocuments,
  listOrgMemberProfileIds,
  listUserOrganizations,
  setActiveOrgContext,
  type CreateOrganizationInput,
  type ImportSource,
  type OrgDoc,
  type OrgSummary,
} from "@/data/org-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

export const orgQueryKeys = {
  all: () => ["orgs"] as const,
  list: (profileId: string) => ["orgs", "list", profileId] as const,
  documents: (orgId: string | null) => ["orgs", "documents", orgId] as const,
  members: (orgId: string | null) => ["orgs", "members", orgId] as const,
};

export function useUserOrganizations() {
  const mode = useWorkspaceMode();
  const isSupabaseMode = mode.kind === "supabase";
  const profileId = isSupabaseMode ? mode.profileId : undefined;

  return useQuery<OrgSummary[]>({
    queryKey: orgQueryKeys.list(profileId ?? "anonymous"),
    enabled: isSupabaseMode && Boolean(profileId),
    queryFn: () => listUserOrganizations(),
  });
}

export function useActiveOrg(): OrgSummary | null {
  const { data } = useUserOrganizations();
  return data?.find((org) => org.isActiveContext) ?? null;
}

export function useSetActiveOrg() {
  const queryClient = useQueryClient();
  const mode = useWorkspaceMode();
  const profileId = mode.kind === "supabase" ? mode.profileId : undefined;

  return useMutation({
    mutationFn: (orgId: string | null) => setActiveOrgContext(orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgQueryKeys.list(profileId ?? "anonymous") });
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const mode = useWorkspaceMode();
  const profileId = mode.kind === "supabase" ? mode.profileId : undefined;

  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      if (!profileId) throw new Error("Authentication required");
      return createOrganization(profileId, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgQueryKeys.list(profileId ?? "anonymous") });
    },
  });
}

export function useOrgDocuments(orgId: string | null | undefined) {
  const mode = useWorkspaceMode();
  const isSupabaseMode = mode.kind === "supabase";
  const enabled = isSupabaseMode && Boolean(orgId);

  return useQuery<OrgDoc[]>({
    queryKey: orgQueryKeys.documents(orgId ?? null),
    enabled,
    queryFn: () => (orgId ? listOrgDocuments(orgId) : Promise.resolve([])),
  });
}

export function useOrgMemberProfileIds(orgId: string | null | undefined) {
  const mode = useWorkspaceMode();
  const enabled = mode.kind === "supabase" && Boolean(orgId);

  return useQuery<string[]>({
    queryKey: orgQueryKeys.members(orgId ?? null),
    enabled,
    queryFn: () => (orgId ? listOrgMemberProfileIds(orgId) : Promise.resolve([])),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  const mode = useWorkspaceMode();
  const profileId = mode.kind === "supabase" ? mode.profileId : undefined;

  return useMutation({
    mutationFn: (orgId: string) => deleteOrganization(orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgQueryKeys.list(profileId ?? "anonymous") });
      void queryClient.invalidateQueries({ queryKey: ["documents-media"] });
    },
  });
}

export function useImportDocumentsToProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: ImportSource) => importDocumentsToProject(projectId, source),
    onSuccess: () => {
      // ProjectDocuments uses queries keyed under documents-media; let the
      // page invalidate via its own hook on completion. We invalidate any
      // org-doc list cache touched as a side effect.
      void queryClient.invalidateQueries({ queryKey: ["documents-media"] });
    },
  });
}
