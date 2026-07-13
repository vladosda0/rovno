import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  subscribeToProjectSyncEvents,
  type ProjectSyncEventRow,
  type ProjectSyncFeedHealth,
} from "@/lib/project-sync-events";
import { planningQueryKeys } from "@/hooks/use-planning-source";
import { procurementProjectItemsQueryRoot } from "@/hooks/use-procurement-source";
import { hrQueryKeys } from "@/hooks/use-hr-source";
import { workspaceQueryKeys, useWorkspaceMode } from "@/hooks/use-workspace-source";
import {
  getEstimateV2ProjectState,
  hasPendingProjectDraftSync,
  hydrateEstimateV2ProjectFromWorkspace,
} from "@/data/estimate-v2-store";

/**
 * P2 realtime consumer: reacts to project_sync_events with query invalidation
 * (never direct cache writes — every reader refetches through its own
 * RLS-gated source, so a member only ever sees what their role permits).
 * Mounted once per project by ProjectLayout. Returns the feed health so the
 * sync chip can say «обновления с задержкой» while the polling fallback is
 * the delivery path.
 */

/**
 * Self-echo policy:
 * - estimate_draft / projection carry the CONTENT revision — skip when it
 *   matches this tab's current revision (covers both this tab's own writes
 *   and identical-content writes, where a refetch would be a no-op anyway).
 * - domain kinds skip when the actor is this profile: this tab's own direct
 *   writes already invalidate through their mutations. A same-user SECOND tab
 *   catches up via focus refetch / staleTime instead (deliberate tradeoff —
 *   the ledger carries no tab identity).
 */
function shouldSkipSelfEcho(
  event: ProjectSyncEventRow,
  projectId: string,
  profileId: string,
): boolean {
  if (event.kind === "estimate_draft" || event.kind === "projection") {
    const localRevision = getEstimateV2ProjectState(projectId).sync.estimateRevision;
    return event.revision !== null && event.revision === localRevision;
  }
  return event.actor_profile_id === profileId;
}

export function useProjectRealtimeInvalidation(
  projectId: string | undefined,
): ProjectSyncFeedHealth | null {
  const queryClient = useQueryClient();
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const profileId = supabaseMode?.profileId ?? null;
  const [health, setHealth] = useState<ProjectSyncFeedHealth | null>(null);
  // The subscription callback must always see the live queryClient without
  // resubscribing the channel when the hook re-renders.
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!projectId || !profileId) {
      setHealth(null);
      return;
    }

    const invalidatePlanning = () => {
      void queryClientRef.current.invalidateQueries({
        queryKey: planningQueryKeys.projectStages(profileId, projectId),
      });
      void queryClientRef.current.invalidateQueries({
        queryKey: planningQueryKeys.projectTasks(profileId, projectId),
      });
    };
    const invalidateProcurement = () => {
      void queryClientRef.current.invalidateQueries({
        queryKey: procurementProjectItemsQueryRoot(profileId, projectId),
      });
    };
    const invalidateHr = () => {
      void queryClientRef.current.invalidateQueries({
        queryKey: hrQueryKeys.projectItemsRoot(profileId, projectId),
      });
      void queryClientRef.current.invalidateQueries({
        queryKey: hrQueryKeys.projectPayments(profileId, projectId),
      });
    };

    const unsubscribe = subscribeToProjectSyncEvents({
      projectId,
      onHealthChange: setHealth,
      onEvents: (events) => {
        const relevant = events.filter(
          (event) => !shouldSkipSelfEcho(event, projectId, profileId),
        );
        if (relevant.length === 0) return;
        const kinds = new Set(relevant.map((event) => event.kind));

        if (kinds.has("projection") || kinds.has("estimate_draft")) {
          invalidatePlanning();
          invalidateProcurement();
          invalidateHr();
          // Only adopt another session's estimate when THIS tab has no pending
          // local draft work. A pending save owns convergence through its own
          // draft_seq CAS (conflict → forceFresh converge); a non-forced
          // hydrate here would race it, and the store's keep-local guard does
          // not cover an empty local structure (a delete-all mid-debounce),
          // so hydrating then would silently revert that in-flight edit.
          if (!hasPendingProjectDraftSync(projectId)) {
            void hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId });
          }
        }
        if (kinds.has("tasks") || kinds.has("checklist")) {
          invalidatePlanning();
        }
        if (kinds.has("procurement")) {
          invalidateProcurement();
        }
        if (kinds.has("hr") || kinds.has("hr_payments")) {
          invalidateHr();
        }
        if (kinds.has("members")) {
          void queryClientRef.current.invalidateQueries({
            queryKey: workspaceQueryKeys.projectMembers(profileId, projectId),
          });
        }
      },
    });

    return () => {
      unsubscribe();
      setHealth(null);
    };
  }, [projectId, profileId]);

  return health;
}
