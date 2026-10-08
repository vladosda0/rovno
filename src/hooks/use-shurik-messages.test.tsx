import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as shurikMessagesSource from "@/data/shurik-messages-source";
import * as store from "@/data/store";
import { MemoryRouter } from "react-router-dom";
import { ShurikMessageList } from "@/components/ai/ShurikMessageList";
import {
  SHURIK_MESSAGES_LIVE_COALESCE_MS,
  shurikMessagesQueryKeys,
  useShurikMessages,
  useShurikMessagesLiveUpdates,
} from "@/hooks/use-shurik-messages";
import { clearDemoSession, clearStoredAuthProfile, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import { authenticateRuntimeAuth, guestRuntimeAuth } from "@/test/runtime-auth";
import type { ShurikMessage } from "@/types/entities";

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function message(partial: Partial<ShurikMessage> = {}): ShurikMessage {
  return {
    id: "msg-1",
    user_id: "profile-1",
    project_id: null,
    type: "billing_payment_failed",
    title: "Не прошло списание за подписку",
    body: "Не прошло списание 2 990 ₽ за подписку.",
    is_read: false,
    read_at: null,
    created_at: "2026-10-09T06:12:00.000Z",
    payload: {},
    ...partial,
  };
}

function Probe() {
  useShurikMessagesLiveUpdates();
  const { messages, unreadCount, markRead } = useShurikMessages();
  return (
    <div>
      <span data-testid="ids">{messages.map((item) => item.id).join("|")}</span>
      <span data-testid="unread">{unreadCount}</span>
      <button type="button" onClick={() => markRead(messages.filter((item) => !item.is_read).map((item) => item.id))}>
        mark
      </button>
    </div>
  );
}

function ListProbe() {
  const { messages, unreadCount, markRead } = useShurikMessages();
  return (
    <>
      <span data-testid="list-unread">{unreadCount}</span>
      <ShurikMessageList messages={messages} onMarkRead={markRead} />
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderProbe(queryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
}

/** An in-memory stand-in for the table: survives a remount the way the database survives a reload. */
function createFakeBackend(initial: ShurikMessage[]) {
  let rows = [...initial];
  const listeners = new Set<() => void>();
  const source: shurikMessagesSource.ShurikMessagesSource = {
    mode: "supabase",
    listMessages: vi.fn(async () => [...rows]),
    markRead: vi.fn(async (ids: string[]) => {
      rows = rows.map((item) => (ids.includes(item.id) ? { ...item, is_read: true, read_at: "2026-10-09T07:00:00.000Z" } : item));
    }),
    subscribe: vi.fn((onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }),
  };
  return {
    source,
    listeners,
    serverInsertQuietly(next: ShurikMessage) {
      rows = [next, ...rows];
    },
    serverInsert(next: ShurikMessage) {
      rows = [next, ...rows];
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useShurikMessages", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    guestRuntimeAuth();
    store.__unsafeResetStoreForTests();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearDemoSession();
  });

  describe("signed in", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
      authenticateRuntimeAuth("profile-1");
    });

    it("lists the user's messages and counts the unread ones", async () => {
      const backend = createFakeBackend([
        message({ id: "msg-2" }),
        message({ id: "msg-1", is_read: true, read_at: "2026-10-08T10:00:00.000Z" }),
      ]);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      renderProbe();

      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-2|msg-1"));
      expect(screen.getByTestId("unread")).toHaveTextContent("1");
    });

    it("writes the read mark to the database, and it is still read after a reload", async () => {
      const backend = createFakeBackend([message({ id: "msg-1" })]);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      const first = renderProbe();
      await waitFor(() => expect(screen.getByTestId("unread")).toHaveTextContent("1"));

      await act(async () => {
        screen.getByRole("button", { name: "mark" }).click();
      });

      expect(backend.source.markRead).toHaveBeenCalledWith(["msg-1"]);
      await waitFor(() => expect(screen.getByTestId("unread")).toHaveTextContent("0"));

      // A reload: nothing cached on the client, only what the backend kept.
      first.unmount();
      renderProbe(createQueryClient());

      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-1"));
      expect(screen.getByTestId("unread")).toHaveTextContent("0");
    });

    it("shows a new message without a reload when the live channel reports it", async () => {
      const backend = createFakeBackend([message({ id: "msg-1", is_read: true })]);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      renderProbe();
      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-1"));
      await waitFor(() => expect(backend.listeners.size).toBe(1));

      act(() => {
        backend.serverInsert(message({ id: "msg-2" }));
      });

      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-2|msg-1"));
      expect(screen.getByTestId("unread")).toHaveTextContent("1");
    });

    it("stops listening when the screen goes away", async () => {
      const backend = createFakeBackend([]);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      const view = renderProbe();
      await waitFor(() => expect(backend.listeners.size).toBe(1));
      view.unmount();

      expect(backend.listeners.size).toBe(0);
    });

    it("puts the unread mark back when the write fails", async () => {
      const backend = createFakeBackend([message({ id: "msg-1" })]);
      backend.source.markRead = vi.fn(async () => {
        throw new Error("permission denied");
      });
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      renderProbe();
      await waitFor(() => expect(screen.getByTestId("unread")).toHaveTextContent("1"));

      await act(async () => {
        screen.getByRole("button", { name: "mark" }).click();
      });

      await waitFor(() => expect(backend.source.markRead).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByTestId("unread")).toHaveTextContent("1"));
    });

    it("asks once to mark a message read when the write is refused and the list still returns it unread", async () => {
      const backend = createFakeBackend([message({ id: "msg-1" })]);
      const write = deferred<void>();
      backend.source.markRead = vi.fn(() => write.promise);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      render(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <ListProbe />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // The optimistic mark is on screen while the write is still out.
      await waitFor(() => expect(backend.source.markRead).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByTestId("list-unread")).toHaveTextContent("0"));
      expect(backend.source.listMessages).toHaveBeenCalledTimes(1);

      await act(async () => {
        write.reject(new Error("permission denied"));
      });

      // The reload brings the row back unread, and it is not asked for again.
      await waitFor(() => expect(backend.source.listMessages).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByTestId("list-unread")).toHaveTextContent("1"));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      expect(backend.source.markRead).toHaveBeenCalledTimes(1);
      expect(backend.source.listMessages).toHaveBeenCalledTimes(2);
    });

    it("keeps the mark through a reload that was in flight, and still shows what that reload was bringing", async () => {
      const backend = createFakeBackend([message({ id: "msg-1" })]);
      const write = deferred<void>();
      const realMarkRead = backend.source.markRead;
      backend.source.markRead = vi.fn(async (ids: string[]) => {
        await write.promise;
        await realMarkRead(ids);
      });
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);
      const queryClient = createQueryClient();

      renderProbe(queryClient);
      await waitFor(() => expect(screen.getByTestId("unread")).toHaveTextContent("1"));

      // A reload goes out and does not come back yet; the server meanwhile has a newer row.
      const staleReload = deferred<ShurikMessage[]>();
      vi.mocked(backend.source.listMessages).mockImplementationOnce(() => staleReload.promise);
      await act(async () => {
        void queryClient.invalidateQueries({ queryKey: shurikMessagesQueryKeys.list("profile-1") });
      });
      await waitFor(() => expect(backend.source.listMessages).toHaveBeenCalledTimes(2));
      backend.serverInsertQuietly(message({ id: "msg-2" }));

      await act(async () => {
        screen.getByRole("button", { name: "mark" }).click();
      });
      await waitFor(() => expect(screen.getByTestId("unread")).toHaveTextContent("0"));

      // The old reload lands with the row still unread: it must not undo the mark on screen.
      await act(async () => {
        staleReload.resolve([message({ id: "msg-2" }), message({ id: "msg-1" })]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(screen.getByTestId("ids")).toHaveTextContent(/^msg-1$/);
      expect(screen.getByTestId("unread")).toHaveTextContent("0");

      await act(async () => {
        write.resolve();
      });

      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-2|msg-1"));
      expect(screen.getByTestId("unread")).toHaveTextContent("1");
      expect(backend.source.listMessages).toHaveBeenCalledTimes(3);
    });

    it("reloads once for a burst of live events", async () => {
      const backend = createFakeBackend([message({ id: "msg-1", is_read: true })]);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      renderProbe();
      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-1"));
      await waitFor(() => expect(backend.listeners.size).toBe(1));
      expect(backend.source.listMessages).toHaveBeenCalledTimes(1);

      vi.useFakeTimers();
      try {
        act(() => {
          backend.serverInsert(message({ id: "msg-2" }));
          backend.serverInsert(message({ id: "msg-3" }));
          backend.serverInsert(message({ id: "msg-4" }));
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SHURIK_MESSAGES_LIVE_COALESCE_MS - 1);
        });
        expect(backend.source.listMessages).toHaveBeenCalledTimes(1);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      } finally {
        vi.useRealTimers();
      }

      await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("msg-4|msg-3|msg-2|msg-1"));
      expect(backend.source.listMessages).toHaveBeenCalledTimes(2);
    });

    it("drops a pending reload when the screen goes away", async () => {
      const backend = createFakeBackend([]);
      vi.spyOn(shurikMessagesSource, "getShurikMessagesSource").mockResolvedValue(backend.source);

      const queryClient = createQueryClient();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const view = renderProbe(queryClient);
      await waitFor(() => expect(backend.listeners.size).toBe(1));
      await waitFor(() => expect(backend.source.listMessages).toHaveBeenCalledTimes(1));
      const listener = [...backend.listeners][0];

      vi.useFakeTimers();
      try {
        listener();
        view.unmount();
        vi.advanceTimersByTime(SHURIK_MESSAGES_LIVE_COALESCE_MS * 2);
      } finally {
        vi.useRealTimers();
      }

      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe("demo", () => {
    beforeEach(() => {
      enterDemoSession("project-1");
      store.__unsafeResetStoreForTests();
    });

    it("reads from the demo store, shows a new message at once and keeps the read mark across a reload", async () => {
      const demoUserId = store.getCurrentUserForMode("demo").id;
      const getSource = vi.spyOn(shurikMessagesSource, "getShurikMessagesSource");

      const first = renderProbe();
      expect(screen.getByTestId("ids")).toHaveTextContent("");
      expect(screen.getByTestId("unread")).toHaveTextContent("0");

      act(() => {
        store.addShurikMessage(message({ id: "msg-demo", user_id: demoUserId }));
        store.addShurikMessage(message({ id: "msg-other", user_id: "someone-else" }));
      });

      expect(screen.getByTestId("ids")).toHaveTextContent("msg-demo");
      expect(screen.getByTestId("ids")).not.toHaveTextContent("msg-other");
      expect(screen.getByTestId("unread")).toHaveTextContent("1");

      act(() => {
        screen.getByRole("button", { name: "mark" }).click();
      });
      expect(screen.getByTestId("unread")).toHaveTextContent("0");
      expect(store.getShurikMessages(demoUserId)[0].read_at).not.toBeNull();

      // A reload inside the demo session: the store is rebuilt from what was persisted.
      first.unmount();
      store.__unsafeResetStoreForTests();
      renderProbe();

      expect(screen.getByTestId("ids")).toHaveTextContent("msg-demo");
      expect(screen.getByTestId("unread")).toHaveTextContent("0");
      expect(getSource).not.toHaveBeenCalled();
    });
  });

  it("gives a guest nothing and asks the backend for nothing", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    const getSource = vi.spyOn(shurikMessagesSource, "getShurikMessagesSource");

    renderProbe();

    expect(screen.getByTestId("ids")).toHaveTextContent("");
    expect(screen.getByTestId("unread")).toHaveTextContent("0");
    expect(getSource).not.toHaveBeenCalled();
  });
});
