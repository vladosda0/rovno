import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  deleteLine,
  deleteWork,
  ensureRemoteEstimateVersionId,
  ensureRemoteStageId,
  flushProjectDraftSync,
  hydrateEstimateV2ProjectFromWorkspace,
} from "@/data/estimate-v2-store";

const rawSupabase = supabase as unknown as SupabaseClient;
const REVERT_MS = 15_000;

/**
 * One template work to add, plus which of its default resources the user deselected
 * in the Constructor. `uncheckedResourceIndexes` are positions into the work's
 * `resourceLines` as listed by list_canonical_stages_with_works (ordered by
 * sort_hint, title) — the SAME order add_library_work_to_estimate returns its
 * `resource_line_ids` in, so a position maps 1:1 to a freshly-created estimate line.
 */
export interface AddWorkRequest {
  templateWorkId: string;
  uncheckedResourceIndexes: number[];
}

/**
 * Adds one or more rovno.ai template works into an EXISTING project stage on the live
 * estimate version via add_library_work_to_estimate, then re-hydrates from server truth
 * and offers a 15s revert. Mirrors useApplyTemplateStages' race/error handling: flush the
 * pending autosave BEFORE the RPCs (so its prune can't delete the freshly-added works),
 * bootstrap a version if missing, forceFresh re-hydrate after, and on a refresh failure do
 * NOT retry (the works are committed server-side — ask the user to reload).
 *
 * Per-resource deselection: the RPC always copies the work's full default resource set
 * (so each kept line keeps the canonical cost/markup), then we prune the deselected ones.
 * The RPC returns `resource_line_ids` ordered exactly like the Constructor's resource
 * checkboxes, so `uncheckedResourceIndexes` index straight into it; the chosen server line
 * ids are deleted AFTER the forceFresh hydrate (when they exist in local state), and the
 * normal autosave-prune removes them server-side.
 */
export function useAddLibraryWork(
  projectId: string,
  estimateVersionId: string | null,
  profileId: string,
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);

  const addWorks = useCallback(
    async (targetProjectStageId: string, works: AddWorkRequest[]) => {
      if (!targetProjectStageId || works.length === 0) return;
      setIsAdding(true);
      try {
        await flushProjectDraftSync(projectId);

        let versionId = estimateVersionId;
        if (!versionId) {
          try {
            versionId = await ensureRemoteEstimateVersionId(projectId);
          } catch {
            versionId = null;
          }
          if (!versionId) {
            toast({ title: t("estimate.constructor.addWorkError"), variant: "destructive" });
            return;
          }
        }

        // A stage created this session is still a LOCAL id until it is re-hydrated; the RPC
        // needs the live project_stages.id. The flush above persisted it, so resolve the
        // server id via the same local->remote mapping the autosave uses.
        let remoteStageId: string | null;
        try {
          remoteStageId = await ensureRemoteStageId(projectId, targetProjectStageId);
        } catch {
          remoteStageId = null;
        }
        if (!remoteStageId) {
          toast({ title: t("estimate.constructor.addWorkError"), variant: "destructive" });
          return;
        }

        const addedWorkIds: string[] = [];
        // Server ids of the freshly-created resource lines the user deselected; deleted
        // after the hydrate so the kept lines retain the RPC's canonical cost/markup.
        const resourceLineIdsToPrune: string[] = [];
        for (const work of works) {
          const { data, error } = await rawSupabase.rpc("add_library_work_to_estimate", {
            p_estimate_version_id: versionId,
            p_project_stage_id: remoteStageId,
            p_template_work_id: work.templateWorkId,
            p_sort_position: null,
          });
          if (error || !data) continue;
          const result = data as { work_id?: string; resource_line_ids?: string[] };
          if (!result.work_id) continue;
          addedWorkIds.push(result.work_id);
          const lineIds = result.resource_line_ids ?? [];
          for (const index of work.uncheckedResourceIndexes) {
            if (index >= 0 && index < lineIds.length) resourceLineIdsToPrune.push(lineIds[index]);
          }
        }

        if (addedWorkIds.length === 0) {
          toast({ title: t("estimate.constructor.addWorkError"), variant: "destructive" });
          return;
        }

        try {
          await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId, forceFresh: true });
        } catch {
          toast({ title: t("estimate.constructor.applyRefreshFailed"), variant: "destructive" });
          return;
        }

        // Drop the deselected resources now that they exist in local state; the debounced
        // autosave prunes them server-side. Kept lines (with canonical costs) stay intact.
        for (const lineId of resourceLineIdsToPrune) deleteLine(projectId, lineId);

        const { dismiss } = toast({
          title: t("estimate.constructor.worksAdded", { count: addedWorkIds.length }),
          action: (
            <ToastAction
              altText={t("estimate.constructor.undo")}
              onClick={() => {
                addedWorkIds.forEach((workId) => deleteWork(projectId, workId));
                dismiss();
              }}
            >
              {t("estimate.constructor.undo")}
            </ToastAction>
          ),
        });
        window.setTimeout(() => dismiss(), REVERT_MS);
      } finally {
        setIsAdding(false);
      }
    },
    [estimateVersionId, profileId, projectId, t, toast],
  );

  return { addWorks, isAdding };
}
