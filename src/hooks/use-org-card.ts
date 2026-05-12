import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClientInfo,
  getOrgCard,
  setClientInfo,
  setOrgCard,
} from "@/data/org-card-source";
import type { ClientInfo, OrgCard } from "@/types/org-card";

export const orgCardQueryKeys = {
  card: (orgId: string | null | undefined) => ["org-card", "card", orgId ?? "anonymous"] as const,
  clientInfo: (projectId: string | null | undefined) =>
    ["org-card", "client-info", projectId ?? "anonymous"] as const,
};

export function useOrgCard(orgId: string | null | undefined) {
  return useQuery<OrgCard | null>({
    queryKey: orgCardQueryKeys.card(orgId),
    queryFn: () => getOrgCard(orgId ?? null),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetOrgCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, card }: { orgId: string; card: OrgCard }) => {
      await setOrgCard(orgId, card);
      return card;
    },
    onSuccess: (card, vars) => {
      queryClient.setQueryData(orgCardQueryKeys.card(vars.orgId), card);
    },
  });
}

export function useClientInfo(projectId: string | null | undefined) {
  return useQuery<ClientInfo | null>({
    queryKey: orgCardQueryKeys.clientInfo(projectId),
    queryFn: () => getClientInfo(projectId ?? null),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetClientInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, info }: { projectId: string; info: ClientInfo }) => {
      await setClientInfo(projectId, info);
      return info;
    },
    onSuccess: (info, vars) => {
      queryClient.setQueryData(orgCardQueryKeys.clientInfo(vars.projectId), info);
    },
  });
}
