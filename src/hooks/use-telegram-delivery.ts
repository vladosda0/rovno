import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTelegramDeliverySource,
  type TelegramDeliverySettings,
  type TelegramDeliverySnapshot,
} from "@/data/telegram-delivery-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

export const telegramDeliveryQueryKeys = {
  snapshot: (profileId: string) => ["telegram-delivery", profileId] as const,
};

/**
 * Where Shurik's messages go besides the app, for the signed-in person. A change is shown at once
 * and written at once, one at a time; a refused write puts back what was on screen before it.
 */
export function useTelegramDelivery(onSaveError: () => void): {
  snapshot: TelegramDeliverySnapshot | undefined;
  isSaving: boolean;
  saveSettings: (patch: Partial<TelegramDeliverySettings>) => void;
} {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const activeMode = mode.kind === "supabase" ? mode : null;
  const queryKey = telegramDeliveryQueryKeys.snapshot(activeMode ? activeMode.profileId : mode.kind);
  const mutationKey = ["telegram-delivery-write", queryKey[1]] as const;
  const writesInFlight = useIsMutating({ mutationKey });

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const source = await getTelegramDeliverySource(activeMode ?? undefined);
      if (!source) throw new Error("Telegram delivery is not available in this mode.");
      return source.load();
    },
    // The link itself changes on another tab of Settings, so every visit rereads it.
    staleTime: 0,
    enabled: Boolean(activeMode),
  });

  const write = useMutation({
    mutationKey,
    mutationFn: async (patch: Partial<TelegramDeliverySettings>) => {
      const source = activeMode ? await getTelegramDeliverySource(activeMode) : null;
      if (!source) throw new Error("Telegram delivery is not available yet.");
      await source.saveSettings(patch);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TelegramDeliverySnapshot>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, { ...previous, settings: { ...previous.settings, ...patch } });
      }
      return { previous, queryKey };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      onSaveError();
    },
    onSettled: (_data, _error, _patch, context) => {
      void queryClient.invalidateQueries({ queryKey: context?.queryKey ?? queryKey });
    },
  });

  return {
    snapshot: activeMode ? query.data : undefined,
    isSaving: writesInFlight > 0,
    saveSettings: (patch) => {
      if (queryClient.isMutating({ mutationKey }) > 0) return;
      write.mutate(patch);
    },
  };
}
