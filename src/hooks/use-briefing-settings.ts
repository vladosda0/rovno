import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBriefingSettingsSource,
  type BriefingSettings,
  type BriefingSettingsSnapshot,
} from "@/data/briefing-settings-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

const BRIEFING_SETTINGS_STALE_TIME_MS = 60_000;

export const briefingSettingsQueryKeys = {
  snapshot: (profileId: string) => ["briefing-settings", profileId] as const,
};

type BriefingSettingsChange = {
  apply: (snapshot: BriefingSettingsSnapshot) => BriefingSettingsSnapshot;
  send: (source: Awaited<ReturnType<typeof getBriefingSettingsSource>>) => Promise<void>;
};

/**
 * The briefing settings of the signed-in person. A change is shown at once and written at once,
 * one at a time: while a write is on its way `isSaving` is set and further changes are dropped.
 * A refused write puts back what was on screen before it; a reload follows every write.
 */
export function useBriefingSettings(onSaveError: () => void): {
  snapshot: BriefingSettingsSnapshot | undefined;
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  saveSettings: (patch: Partial<BriefingSettings>) => void;
  setProjectMuted: (projectId: string, muted: boolean) => void;
} {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const activeMode = mode.kind === "supabase" || mode.kind === "demo" || mode.kind === "local" ? mode : null;
  const queryKey = briefingSettingsQueryKeys.snapshot(mode.kind === "supabase" ? mode.profileId : mode.kind);
  // Keyed by the person, not kept in this hook: the settings tab unmounts while a write may still be on its way.
  const mutationKey = ["briefing-settings-write", queryKey[1]] as const;
  const writesInFlight = useIsMutating({ mutationKey });

  const query = useQuery({
    queryKey,
    queryFn: async () => (await getBriefingSettingsSource(activeMode ?? undefined)).load(),
    enabled: Boolean(activeMode),
    staleTime: BRIEFING_SETTINGS_STALE_TIME_MS,
  });

  const write = useMutation({
    mutationKey,
    mutationFn: async (change: BriefingSettingsChange) => {
      if (!activeMode) throw new Error("Briefing settings are not available yet.");
      await change.send(await getBriefingSettingsSource(activeMode));
    },
    onMutate: async (change) => {
      // A reload already in flight would land after the change and undo it on screen.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BriefingSettingsSnapshot>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, change.apply(previous));
      // The key travels with the write: by the time it is answered another person may be signed in.
      return { previous, queryKey };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      onSaveError();
    },
    onSettled: (_data, _error, _change, context) => {
      void queryClient.invalidateQueries({ queryKey: context?.queryKey ?? queryKey });
    },
  });

  const run = (change: BriefingSettingsChange) => {
    // Asked of the client at the moment of the click, so one that comes before the re-render stops here too.
    if (queryClient.isMutating({ mutationKey }) > 0) return;
    write.mutate(change);
  };

  return {
    snapshot: activeMode ? query.data : undefined,
    isLoading: mode.kind === "pending-supabase" || (Boolean(activeMode) && query.isPending),
    isError: query.isError,
    isSaving: writesInFlight > 0,
    saveSettings: (patch) =>
      run({
        apply: (snapshot) => ({ ...snapshot, settings: { ...snapshot.settings, ...patch } }),
        send: (source) => source.saveSettings(patch),
      }),
    setProjectMuted: (projectId, muted) =>
      run({
        apply: (snapshot) => {
          const others = snapshot.mutedProjectIds.filter((id) => id !== projectId);
          return { ...snapshot, mutedProjectIds: muted ? [...others, projectId] : others };
        },
        send: (source) => source.setProjectMuted(projectId, muted),
      }),
  };
}
