import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type ClientInfoScope,
  type OrgCardScope,
  loadClientInfo,
  loadOrgCard,
  orgCardScopeKey,
  saveClientInfo,
  saveOrgCard,
} from "@/data/org-card-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { useUserOrganizations } from "@/hooks/use-orgs";
import type { OrgSummary } from "@/data/org-source";
import type { ClientInfo, OrgCard } from "@/types/org-card";

const client = supabase as unknown as SupabaseClient;

export const orgCardQueryKeys = {
  card: (scope: OrgCardScope | null) => ["org-card", "card", orgCardScopeKey(scope)] as const,
  clientInfo: (scope: ClientInfoScope | null) =>
    ["org-card", "client-info", scope ? `${scope.kind}:${scope.projectId}` : "none"] as const,
};

/**
 * Where the contractor requisites of this export live: the active
 * organization (owner and admin edit, members read), the person's own profile
 * when there is no organization, or this browser in the demo and local
 * workspaces.
 */
export function useOrgCardScope(
  projectId: string | null,
  activeOrg: Pick<OrgSummary, "id" | "role"> | null,
): OrgCardScope | null {
  const mode = useWorkspaceMode();
  const orgsQuery = useUserOrganizations();
  if (mode.kind === "supabase") {
    // Until the organization list has loaded, a person in an organization would
    // look like a person without one, and the profile would get the org's details.
    if (orgsQuery.data === undefined) return null;
    if (activeOrg) {
      return { kind: "org", orgId: activeOrg.id, canEdit: activeOrg.role === "owner" || activeOrg.role === "admin" };
    }
    return { kind: "profile", profileId: mode.profileId, projectId };
  }
  const key = activeOrg?.id ?? (projectId ? `local:${projectId}` : null);
  return key ? { kind: "device", key } : null;
}

export function useClientInfoScope(projectId: string | null): ClientInfoScope | null {
  const mode = useWorkspaceMode();
  if (!projectId) return null;
  return mode.kind === "supabase" ? { kind: "server", projectId } : { kind: "device", projectId };
}

export function useOrgCard(scope: OrgCardScope | null) {
  return useQuery<OrgCard | null>({
    queryKey: orgCardQueryKeys.card(scope),
    enabled: scope !== null,
    queryFn: () => (scope ? loadOrgCard(client, scope) : Promise.resolve(null)),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetOrgCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ scope, card }: { scope: OrgCardScope; card: OrgCard }) => {
      await saveOrgCard(client, scope, card);
      return card;
    },
    onSuccess: (card, vars) => {
      queryClient.setQueryData(orgCardQueryKeys.card(vars.scope), card);
    },
  });
}

export function useClientInfo(scope: ClientInfoScope | null) {
  return useQuery<ClientInfo | null>({
    queryKey: orgCardQueryKeys.clientInfo(scope),
    enabled: scope !== null,
    queryFn: () => (scope ? loadClientInfo(client, scope) : Promise.resolve(null)),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetClientInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ scope, info }: { scope: ClientInfoScope; info: ClientInfo }) => {
      await saveClientInfo(client, scope, info);
      return info;
    },
    onSuccess: (info, vars) => {
      queryClient.setQueryData(orgCardQueryKeys.clientInfo(vars.scope), info);
    },
  });
}
