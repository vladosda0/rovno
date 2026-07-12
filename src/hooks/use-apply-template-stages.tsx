import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { trackEvent } from "@/lib/analytics";
import { captureException } from "@/lib/observability/sentry";
import {
  deleteStage,
  deleteWork,
  ensureRemoteEstimateVersionId,
  flushProjectDraftSync,
  hydrateEstimateV2ProjectFromWorkspace,
} from "@/data/estimate-v2-store";

const rawSupabase = supabase as unknown as SupabaseClient;
const REVERT_MS = 15_000;

export interface StageApplySelection {
  templateStageId: string;
  stageTitle: string;
  /**
   * templateWorkIds of the stage's works in browse-tree order. The apply RPC
   * returns work_ids in this same (sort_hint, title) order, so position i maps a
   * returned estimate_work id back to the work the user (un)checked.
   */
  orderedTemplateWorkIds: string[];
  /** templateWorkIds the user left unchecked; pruned after the whole-stage apply. */
  uncheckedTemplateWorkIds: string[];
}

/**
 * Applies one or more rovno.ai template stages onto the live estimate version via
 * apply_template_stage_to_estimate, re-hydrates the client store from server
 * truth, prunes unchecked works on partial stages, and offers a 15s revert.
 *
 * Note: per-toast duration isn't supported by use-toast, so the auto-dismiss is a
 * manual setTimeout. Revert deletes the applied stages (cascades works/lines);
 * the debounced autosave then prunes them server-side (RLS delete policies allow it).
 */
export function useApplyTemplateStages(
  projectId: string,
  estimateVersionId: string | null,
  profileId: string,
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isApplying, setIsApplying] = useState(false);

  const applyStages = useCallback(
    async (selections: StageApplySelection[]) => {
      if (selections.length === 0) return;
      setIsApplying(true);
      try {
        // Drain any pending autosave BEFORE mutating server rows, so its prune step can't
        // race the apply RPC and delete the stages/works we're about to insert.
        await flushProjectDraftSync(projectId);

        // A brand-new estimate has no server version yet; create the root + current version
        // (idempotent, reusing the autosave's deterministic ids) so the constructor can
        // populate an empty estimate. Otherwise use the already-resolved version id.
        let versionId = estimateVersionId;
        if (!versionId) {
          try {
            versionId = await ensureRemoteEstimateVersionId(projectId);
          } catch {
            versionId = null;
          }
          if (!versionId) {
            toast({ title: t("estimate.constructor.applyError"), variant: "destructive" });
            return;
          }
        }

        const appliedStageIds: string[] = [];
        const resultBySelection: Array<{ projectStageId: string; workIds: string[] } | null> = [];
        for (const selection of selections) {
          const { data, error } = await rawSupabase.rpc("apply_template_stage_to_estimate", {
            p_estimate_version_id: versionId,
            p_template_stage_id: selection.templateStageId,
            p_sort_position: null,
          });
          if (error || !data) {
            // The loop deliberately continues on per-stage failure (partial
            // apply UX) — report the swallowed error so critical-RPC alerts
            // (alert-runbook.md) still see it.
            if (error) {
              captureException(error, {
                tags: { source: "rpc", rpc: "apply_template_stage_to_estimate" },
              });
            }
            resultBySelection.push(null);
            continue;
          }
          const result = data as { project_stage_id: string; work_ids?: unknown };
          const workIds = Array.isArray(result.work_ids) ? (result.work_ids as string[]) : [];
          appliedStageIds.push(result.project_stage_id);
          resultBySelection.push({ projectStageId: result.project_stage_id, workIds });
        }

        if (appliedStageIds.length === 0) {
          toast({ title: t("estimate.constructor.applyError"), variant: "destructive" });
          return;
        }

        // Force a fresh re-hydrate that adopts server truth (bypassing the pending-sync
        // early-return). The apply RPC is non-idempotent, so on a refresh failure we do NOT
        // retry: the stages are committed server-side, ask the user to reload (and let the
        // caller clear its selection so a blind re-apply can't double-insert).
        try {
          await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId, forceFresh: true });
        } catch {
          toast({ title: t("estimate.constructor.applyRefreshFailed"), variant: "destructive" });
          return;
        }

        // Partial stages: remove unchecked works. apply_template_stage_to_estimate
        // returns work_ids in the same (sort_hint, title) order the browse tree lists
        // a stage's works, so work_ids[i] is the estimate_work created for
        // orderedTemplateWorkIds[i]. Matching on that stable per-work position (rather
        // than the non-unique system_work_article_id) guarantees we delete exactly the
        // works the user unchecked, never a kept sibling that shares an article id.
        selections.forEach((selection, index) => {
          const result = resultBySelection[index];
          if (!result || selection.uncheckedTemplateWorkIds.length === 0) return;
          // If the returned ids don't line up 1:1 with the browse-tree works (e.g. the
          // cached tree drifted from the template), skip the prune rather than risk
          // deleting the wrong rows by a misaligned index.
          if (result.workIds.length !== selection.orderedTemplateWorkIds.length) return;
          const unchecked = new Set(selection.uncheckedTemplateWorkIds);
          selection.orderedTemplateWorkIds.forEach((templateWorkId, workIndex) => {
            if (unchecked.has(templateWorkId)) deleteWork(projectId, result.workIds[workIndex]);
          });
        });

        trackEvent("template_applied", { stage_count: appliedStageIds.length });

        const { dismiss } = toast({
          title: t("estimate.constructor.applied", { count: appliedStageIds.length }),
          action: (
            <ToastAction
              altText={t("estimate.constructor.undo")}
              onClick={() => {
                appliedStageIds.forEach((stageId) => deleteStage(projectId, stageId));
                dismiss();
              }}
            >
              {t("estimate.constructor.undo")}
            </ToastAction>
          ),
        });
        window.setTimeout(() => dismiss(), REVERT_MS);
      } finally {
        setIsApplying(false);
      }
    },
    [estimateVersionId, profileId, projectId, t, toast],
  );

  return { applyStages, isApplying };
}
