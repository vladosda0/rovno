import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as store from "@/data/store";
import {
  countUnreadShurikMessages,
  getShurikMessagesSource,
  isShownInMessagesPanel,
} from "@/data/shurik-messages-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { ShurikMessage } from "@/types/entities";

const SHURIK_MESSAGES_STALE_TIME_MS = 60_000;
/** A burst of live events (marking several read is one event per row) becomes one reload. */
export const SHURIK_MESSAGES_LIVE_COALESCE_MS = 250;
const EMPTY_MESSAGES: ShurikMessage[] = [];

export const shurikMessagesQueryKeys = {
  list: (profileId: string) => ["shurik-messages", profileId] as const,
};

function useBrowserShurikMessages(kind: "demo" | "local" | null): ShurikMessage[] {
  const read = useCallback(
    () => (kind
      ? store.getShurikMessages(store.getCurrentUserForMode(kind).id).filter(isShownInMessagesPanel)
      : EMPTY_MESSAGES),
    [kind],
  );
  const [messages, setMessages] = useState(read);

  useEffect(() => {
    setMessages(read());
    if (!kind) return;
    return store.subscribe(() => setMessages(read()));
  }, [kind, read]);

  return kind ? messages : EMPTY_MESSAGES;
}

/** The signed-in person's messages from Shurik, newest first, and the way to mark them read. */
export function useShurikMessages(): {
  messages: ShurikMessage[];
  unreadCount: number;
  markRead: (ids: string[]) => void;
} {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const browserKind = mode.kind === "demo" || mode.kind === "local" ? mode.kind : null;
  const profileId = supabaseMode?.profileId ?? null;
  const browserMessages = useBrowserShurikMessages(browserKind);

  const query = useQuery({
    queryKey: shurikMessagesQueryKeys.list(profileId ?? "browser"),
    queryFn: async () => {
      const source = await getShurikMessagesSource(supabaseMode ?? undefined);
      return source.listMessages();
    },
    enabled: Boolean(supabaseMode),
    staleTime: SHURIK_MESSAGES_STALE_TIME_MS,
    // Opted back in: the list is read-only on screen, and a tab that slept through
    // a dropped live connection catches up when the person returns to it.
    refetchOnWindowFocus: true,
  });

  const markRead = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      if (browserKind) {
        store.markShurikMessagesRead(ids);
        return;
      }
      if (!profileId) return;

      const queryKey = shurikMessagesQueryKeys.list(profileId);
      const readAt = new Date().toISOString();

      void (async () => {
        // A reload already in flight would land after the optimistic mark and undo it on screen.
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData<ShurikMessage[]>(queryKey, (current) =>
          current?.map((message) =>
            ids.includes(message.id) && !message.is_read ? { ...message, is_read: true, read_at: readAt } : message,
          ),
        );
        try {
          const source = await getShurikMessagesSource({ kind: "supabase", profileId });
          await source.markRead(ids);
        } catch {
          // The reload below shows what the database holds, so a refused write does not stay "read".
        } finally {
          // Also on success: the reload cancelled above may have been bringing new rows.
          void queryClient.invalidateQueries({ queryKey });
        }
      })();
    },
    [browserKind, profileId, queryClient],
  );

  const messages = browserKind ? browserMessages : (supabaseMode ? query.data ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const unreadCount = useMemo(() => countUnreadShurikMessages(messages), [messages]);

  return { messages, unreadCount, markRead };
}

/**
 * Keeps the list fresh from the live channel. Mount it once per screen (the app layout does):
 * every reader of `useShurikMessages` shares the one query this refreshes.
 */
export function useShurikMessagesLiveUpdates(): void {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const profileId = mode.kind === "supabase" ? mode.profileId : null;

  useEffect(() => {
    if (!profileId) return;

    let cancelled = false;
    let unsubscribe = () => {};
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    void getShurikMessagesSource({ kind: "supabase", profileId }).then((source) => {
      if (cancelled) return;
      unsubscribe = source.subscribe(() => {
        if (reloadTimer) return;
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          void queryClient.invalidateQueries({ queryKey: shurikMessagesQueryKeys.list(profileId) });
        }, SHURIK_MESSAGES_LIVE_COALESCE_MS);
      });
    });

    return () => {
      cancelled = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      unsubscribe();
    };
  }, [profileId, queryClient]);
}
