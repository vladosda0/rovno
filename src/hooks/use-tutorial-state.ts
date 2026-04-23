import { useCallback } from "react";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";

const STORAGE_PREFIX = "tutorial-seen:";

export type TutorialKey =
  | "onboarding"
  | "estimate_flow"
  | "ai_sidebar"
  | "documents"
  | "media";

/** Returns whether the user has already seen a given tutorial. */
export function useHasSeenTutorial(key: TutorialKey): boolean {
  if (typeof window === "undefined") return false;
  // Suppress tutorial auto-open under test runners (Vitest/Jest) so onboarding
  // overlays don't intercept clicks in component tests.
  if (import.meta.env?.MODE === "test" || (globalThis as { __vitest__?: unknown }).__vitest__) {
    return true;
  }
  return localStorage.getItem(`${STORAGE_PREFIX}${key}`) === "true";
}

/** Marks a tutorial as seen (localStorage + Supabase when in supabase mode). */
export function useMarkTutorialSeen() {
  const mode = useWorkspaceMode();
  const { user } = useRuntimeAuth();

  return useCallback(
    async (key: TutorialKey) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, "true");
      }

      if (mode.kind === "supabase" && user?.id) {
        try {
          // RPC defined in migration 20260423000000_profile_tutorial_state.sql.
          // Not yet in backend-truth mirror; typed escape is intentional.
          await (
            supabase as unknown as {
              rpc: (
                name: string,
                args: Record<string, unknown>,
              ) => { throwOnError: () => Promise<unknown> };
            }
          )
            .rpc("append_tutorial_completed", {
              p_profile_id: user.id,
              p_key: key,
            })
            .throwOnError();
        } catch {
          // Non-fatal — localStorage is the fallback
        }
      }
    },
    [mode, user],
  );
}
