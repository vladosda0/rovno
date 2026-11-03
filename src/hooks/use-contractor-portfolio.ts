import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPortfolioObject,
  deletePortfolioObject,
  fetchPortfolioObjects,
  removeOwnPhotos,
  reorderPortfolioObjects,
  updatePortfolioObject,
  type PortfolioObject,
  type PortfolioObjectInput,
} from "@/data/contractor-portfolio-source";

// Under the ["orgs"] key, like the card itself, so leaving an organization drops it.
export const contractorPortfolioQueryKey = (orgId: string | null | undefined) =>
  ["orgs", "contractor-portfolio", orgId ?? null] as const;

export function useContractorPortfolio(orgId: string | null | undefined) {
  return useQuery<PortfolioObject[]>({
    queryKey: contractorPortfolioQueryKey(orgId),
    enabled: Boolean(orgId),
    queryFn: () => (orgId ? fetchPortfolioObjects(orgId) : Promise.resolve([])),
  });
}

export function useContractorPortfolioMutations(orgId: string) {
  const queryClient = useQueryClient();
  const key = contractorPortfolioQueryKey(orgId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async ({ object, input }: { object: PortfolioObject | null; input: PortfolioObjectInput }) => {
      const saved = object ? await updatePortfolioObject(object.id, input) : await createPortfolioObject(orgId, input);
      if (object) await removeOwnPhotos(object.photos.filter((url) => !input.photos.includes(url)));
      return saved;
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: async (object: PortfolioObject) => {
      await deletePortfolioObject(object.id);
      await removeOwnPhotos(object.photos);
    },
    onSettled: refresh,
  });

  // The new order shows at once and is rolled back if the server refuses it.
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderPortfolioObjects(orgId, ids),
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PortfolioObject[]>(key);
      if (previous) {
        const byId = new Map(previous.map((item) => [item.id, item]));
        queryClient.setQueryData<PortfolioObject[]>(
          key,
          ids.map((id, position) => ({ ...(byId.get(id) as PortfolioObject), position })).filter((item) => item.id),
        );
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: refresh,
  });

  return { save, remove, reorder };
}
