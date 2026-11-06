// Follows the document a guest asked to follow before signing up (docs-library
// 8.5, frame 5a), as soon as this tab has a signed-in person. Mounted once in
// App; loads the knowledge-base client only when something is waiting.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import {
  clearKbPendingWatch,
  isPermanentKbWatchRefusal,
  kbWatchingKey,
  peekKbPendingWatch,
} from "@/lib/knowledge-base/kbPendingWatch";

export function KbPendingWatch() {
  const auth = useRuntimeAuth();
  const profileId = auth.status === "authenticated" ? auth.profileId : null;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId) return;
    const slug = peekKbPendingWatch();
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      try {
        const { setKbWatch } = await import("@/lib/knowledge-base/api");
        const state = await setKbWatch(slug, true);
        if (cancelled) return;
        clearKbPendingWatch(slug);
        const key = kbWatchingKey(slug, profileId);
        await queryClient.cancelQueries({ queryKey: key });
        queryClient.setQueryData(key, state);
      } catch (error) {
        // A network error or a refused session keeps it for the next sign-in.
        if (isPermanentKbWatchRefusal(error)) clearKbPendingWatch(slug);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, queryClient]);

  return null;
}
