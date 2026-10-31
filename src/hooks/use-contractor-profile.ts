import { useQuery } from "@tanstack/react-query";
import { fetchContractorProfile, type ContractorProfile } from "@/data/contractor-profile-source";

// Under the ["orgs"] key, so saving the card through the form refreshes it.
export const contractorProfileQueryKey = (orgId: string | null | undefined) =>
  ["orgs", "contractor-profile", orgId ?? null] as const;

export function useContractorProfile(orgId: string | null | undefined) {
  return useQuery<ContractorProfile | null>({
    queryKey: contractorProfileQueryKey(orgId),
    enabled: Boolean(orgId),
    queryFn: () => (orgId ? fetchContractorProfile(orgId) : Promise.resolve(null)),
  });
}
