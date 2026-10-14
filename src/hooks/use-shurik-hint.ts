import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dismissShurikHint, fetchShurikHintOfDay } from "@/data/shurik-hint-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { resolveShurikHintAction, shurikHintTextKey, type ShurikHintOfDay } from "@/lib/shurik-hints";

/** Short enough that "Сделано" appears soon after the person did the thing on another screen. */
const SHURIK_HINT_STALE_TIME_MS = 2 * 60_000;

/** `YYYY-MM-DD` on the person's own clock: a new day asks the server again. */
function localDay(now: Date): string {
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export const shurikHintQueryKeys = {
  all: ["shurik-hint"] as const,
  project: (profileId: string, projectId: string) => ["shurik-hint", profileId, projectId] as const,
  ofDay: (profileId: string, projectId: string, day: string) => ["shurik-hint", profileId, projectId, day] as const,
};

/**
 * Today's hint in this project, from the server. Only a signed-in person on the real backend has
 * one: the demo and local workspaces have no journal to pick from, so they get no card.
 * A dismissed hint is kept out of the answer, so callers only ever see one to draw.
 */
export function useShurikHintOfDay(projectId: string | null | undefined): {
  hint: ShurikHintOfDay | null;
  dismiss: () => void;
} {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const profileId = mode.kind === "supabase" ? mode.profileId : null;
  const queryKey = shurikHintQueryKeys.ofDay(profileId ?? "none", projectId ?? "none", localDay(new Date()));

  const query = useQuery({
    queryKey,
    queryFn: () => fetchShurikHintOfDay(projectId as string),
    enabled: Boolean(profileId && projectId),
    staleTime: SHURIK_HINT_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    // A failed read is no reason to show anything; the next focus asks again.
    retry: false,
  });

  const dismiss = useMutation({
    mutationFn: () => dismissShurikHint(projectId as string),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ShurikHintOfDay | null>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, { ...previous, status: "dismissed" });
      return { previous };
    },
    // Not closed on the server: it would come back on the next read anyway, so show it again now.
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const hint = profileId && projectId ? query.data ?? null : null;
  return {
    hint: hint && hint.status !== "dismissed" ? hint : null,
    dismiss: () => {
      if (!profileId || !projectId || !hint) return;
      dismiss.mutate();
    },
  };
}

/** Whether this app has words and an address for the hint the server picked. Without them no card is drawn. */
export function useShurikHintRenderable(hint: ShurikHintOfDay | null, projectId: string | null | undefined): boolean {
  const { i18n } = useTranslation();
  if (!hint || !projectId) return false;
  return i18n.exists(shurikHintTextKey(hint.hint_key)) && resolveShurikHintAction(hint, projectId) !== null;
}
