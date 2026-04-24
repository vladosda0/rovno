import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import type { Database as WorkspaceDatabase } from "../../backend-truth/generated/supabase-types";

const STORAGE_PREFIX = "tutorial-seen:";
type TypedSupabaseClient = SupabaseClient<WorkspaceDatabase>;
const profileStateClient = supabase as unknown as TypedSupabaseClient;

export type TutorialKey =
  | "onboarding"
  | "estimate_flow"
  | "ai_sidebar"
  | "documents"
  | "media";

function isTutorialSuppressedInTests(): boolean {
  return import.meta.env?.MODE === "test" || (globalThis as { __vitest__?: unknown }).__vitest__ != null;
}

function tutorialStorageKey(key: TutorialKey, userId?: string | null): string {
  const normalizedUserId = userId?.trim();
  return normalizedUserId ? `${STORAGE_PREFIX}${normalizedUserId}:${key}` : `${STORAGE_PREFIX}${key}`;
}

function hasSeenTutorialLocally(key: TutorialKey, userId?: string | null): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(tutorialStorageKey(key, userId)) === "true";
}

function markTutorialSeenLocally(key: TutorialKey, userId?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(tutorialStorageKey(key, userId), "true");
}

function includesTutorialKey(value: unknown, key: TutorialKey): boolean {
  return Array.isArray(value) && value.includes(key);
}

/** Returns whether the user has already seen a given tutorial. */
export function useHasSeenTutorial(key: TutorialKey): boolean {
  const mode = useWorkspaceMode();
  const { user } = useRuntimeAuth();
  const userId = user?.id ?? null;
  const localSeen = useMemo(() => hasSeenTutorialLocally(key, userId), [key, userId]);
  const [hasSeen, setHasSeen] = useState(localSeen);
  const [checkingRemote, setCheckingRemote] = useState(false);

  useEffect(() => {
    if (isTutorialSuppressedInTests()) {
      setHasSeen(true);
      setCheckingRemote(false);
      return;
    }

    if (hasSeenTutorialLocally(key, userId)) {
      setHasSeen(true);
      setCheckingRemote(false);
      return;
    }

    if (mode.kind === "pending-supabase") {
      setCheckingRemote(true);
      return;
    }

    if (mode.kind !== "supabase" || !userId) {
      setHasSeen(false);
      setCheckingRemote(false);
      return;
    }

    let cancelled = false;
    setCheckingRemote(true);
    void (async () => {
      try {
        const { data, error } = await profileStateClient
          .from("profiles")
          .select("tutorials_completed")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setHasSeen(false);
          return;
        }

        const remoteSeen = includesTutorialKey(data?.tutorials_completed, key);
        if (remoteSeen) {
          markTutorialSeenLocally(key, userId);
        }
        setHasSeen(remoteSeen);
      } catch {
        if (!cancelled) {
          setHasSeen(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingRemote(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, mode.kind, userId]);

  if (typeof window === "undefined") return false;
  // Suppress tutorial auto-open under test runners (Vitest/Jest) so onboarding
  // overlays don't intercept clicks in component tests.
  if (isTutorialSuppressedInTests()) {
    return true;
  }
  if (mode.kind === "pending-supabase" || checkingRemote) return true;
  return hasSeen;
}

/** Marks a tutorial as seen (localStorage + Supabase when in supabase mode). */
export function useMarkTutorialSeen() {
  const mode = useWorkspaceMode();
  const { user } = useRuntimeAuth();

  return useCallback(
    async (key: TutorialKey) => {
      markTutorialSeenLocally(key, user?.id);

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
