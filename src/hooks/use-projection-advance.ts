import { useEffect, useRef } from "react";

/**
 * Runs `onAdvance` when the estimate projection revision CHANGES for a given
 * scope (profile+project) — never on mount and never on scope switch, where the
 * incoming value is a baseline, not a change. Used to invalidate stable react-query
 * roots after a projection lands, without defeating staleTime on first render.
 */
export function useProjectionAdvance(
  scopeKey: string | null,
  revision: string | null,
  onAdvance: () => void,
): void {
  const lastSeenRef = useRef<{ scopeKey: string; revision: string | null } | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  useEffect(() => {
    if (!scopeKey) {
      lastSeenRef.current = null;
      return;
    }
    if (lastSeenRef.current?.scopeKey !== scopeKey) {
      lastSeenRef.current = { scopeKey, revision };
      return;
    }
    if (lastSeenRef.current.revision === revision) return;
    lastSeenRef.current = { scopeKey, revision };
    onAdvanceRef.current();
  }, [scopeKey, revision]);
}
