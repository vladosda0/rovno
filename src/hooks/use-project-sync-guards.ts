import { useEffect } from "react";
import {
  flushProjectDraftSync,
  hasPendingProjectDraftSync,
} from "@/data/estimate-v2-store";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

/**
 * P2 hygiene guards, mounted once per project by ProjectLayout:
 * - visibilitychange → hidden: flush the debounced draft sync immediately.
 *   A backgrounded/closing tab must not sit on a 300ms timer that may never
 *   fire again (mobile tab discard, OS sleep).
 * - beforeunload: while a sync is pending, ask the browser for the native
 *   "leave site?" confirmation — the only honest option left at that point.
 */
export function useProjectSyncGuards(projectId: string | undefined): void {
  const mode = useWorkspaceMode();
  const active = mode.kind === "supabase" && Boolean(projectId);

  useEffect(() => {
    if (!active || !projectId || typeof document === "undefined") {
      return;
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hasPendingProjectDraftSync(projectId)) {
        void flushProjectDraftSync(projectId);
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPendingProjectDraftSync(projectId)) {
        event.preventDefault();
        // Chrome requires returnValue to trigger the native dialog.
        event.returnValue = "";
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, projectId]);
}
