import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  subscribeToProjectSyncEvents,
  type ProjectSyncEventRow,
  type ProjectSyncFeedHealth,
} from "@/lib/project-sync-events";

type ChannelCallback = (payload: { new: ProjectSyncEventRow }) => void;
type StatusCallback = (status: string) => void;

const harness = vi.hoisted(() => {
  const state = {
    channelCallback: null as ChannelCallback | null,
    statusCallback: null as StatusCallback | null,
    unsubscribe: vi.fn(),
    channelName: null as string | null,
    // Queue of responses for .from("project_sync_events") selects, in call
    // order (first = the baseline max-id fetch, then polls).
    selectResponses: [] as Array<{ data: unknown; error: unknown }>,
    selectCalls: [] as Array<Record<string, unknown>>,
  };

  const makeBuilder = () => {
    const captured: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        captured[`eq:${column}`] = value;
        return builder;
      }),
      gt: vi.fn((column: string, value: unknown) => {
        captured[`gt:${column}`] = value;
        return builder;
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => {
        state.selectCalls.push(captured);
        return Promise.resolve(state.selectResponses.shift() ?? { data: [], error: null });
      }),
    };
    return builder;
  };

  const supabase = {
    channel: vi.fn((name: string) => {
      state.channelName = name;
      const channel = {
        on: vi.fn((_event: string, _filter: unknown, callback: ChannelCallback) => {
          state.channelCallback = callback;
          return channel;
        }),
        subscribe: vi.fn((statusCallback: StatusCallback) => {
          state.statusCallback = statusCallback;
          return channel;
        }),
        unsubscribe: state.unsubscribe,
      };
      return channel;
    }),
    from: vi.fn(() => makeBuilder()),
  };

  return { state, supabase };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: harness.supabase,
}));

function row(id: number, partial: Partial<ProjectSyncEventRow> = {}): ProjectSyncEventRow {
  return {
    id,
    project_id: "project-1",
    kind: "tasks",
    revision: null,
    actor_profile_id: "actor-1",
    created_at: "2026-07-13T00:00:00.000Z",
    ...partial,
  };
}

async function flushAsync(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("subscribeToProjectSyncEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.state.channelCallback = null;
    harness.state.statusCallback = null;
    harness.state.channelName = null;
    harness.state.selectResponses = [];
    harness.state.selectCalls = [];
    harness.state.unsubscribe.mockClear();
    harness.supabase.channel.mockClear();
    harness.supabase.from.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces realtime inserts and skips ids at or below the subscribe baseline", async () => {
    harness.state.selectResponses.push({ data: [{ id: 10 }], error: null }); // baseline
    const batches: ProjectSyncEventRow[][] = [];
    const dispose = subscribeToProjectSyncEvents({
      projectId: "project-1",
      onEvents: (events) => batches.push(events),
    });
    await flushAsync();
    expect(harness.state.channelName).toBe("project-sync:project-1");
    harness.state.statusCallback?.("SUBSCRIBED");
    await flushAsync();

    harness.state.channelCallback?.({ new: row(10) }); // pre-baseline: dropped
    harness.state.channelCallback?.({ new: row(12) });
    harness.state.channelCallback?.({ new: row(11) });
    harness.state.channelCallback?.({ new: row(12) }); // duplicate: dropped
    expect(batches).toEqual([]); // still coalescing

    await flushAsync(250);
    expect(batches).toEqual([[row(11), row(12)]]);
    dispose();
  });

  it("reports live on subscribe and degraded + polls when the channel drops", async () => {
    harness.state.selectResponses.push({ data: [{ id: 5 }], error: null }); // baseline
    const health: ProjectSyncFeedHealth[] = [];
    const batches: ProjectSyncEventRow[][] = [];
    const dispose = subscribeToProjectSyncEvents({
      projectId: "project-1",
      onEvents: (events) => batches.push(events),
      onHealthChange: (next) => health.push(next),
    });
    await flushAsync();
    // SUBSCRIBED triggers a catch-up poll; queue its empty page first.
    harness.state.selectResponses.push({ data: [], error: null });
    harness.state.statusCallback?.("SUBSCRIBED");
    expect(health).toEqual(["live"]);
    await flushAsync();

    harness.state.selectResponses.push({ data: [row(6, { kind: "procurement" })], error: null }); // immediate poll
    harness.state.statusCallback?.("CHANNEL_ERROR");
    expect(health).toEqual(["live", "degraded"]);
    await flushAsync(250); // poll resolves + coalesce window
    expect(batches).toEqual([[row(6, { kind: "procurement" })]]);

    // The interval keeps polling from the last seen id.
    harness.state.selectResponses.push({ data: [row(7)], error: null });
    await flushAsync(30_000);
    const lastPoll = harness.state.selectCalls.at(-1);
    expect(lastPoll?.["gt:id"]).toBe(6);
    await flushAsync(250);
    expect(batches).toEqual([[row(6, { kind: "procurement" })], [row(7)]]);
    dispose();
  });

  it("goes unavailable on a pre-P2 backend (ledger table missing) without opening a channel", async () => {
    harness.state.selectResponses.push({ data: null, error: { code: "PGRST205" } });
    const health: ProjectSyncFeedHealth[] = [];
    const dispose = subscribeToProjectSyncEvents({
      projectId: "project-1",
      onEvents: () => {},
      onHealthChange: (next) => health.push(next),
    });
    await flushAsync();
    expect(health).toEqual(["unavailable"]);
    expect(harness.supabase.channel).not.toHaveBeenCalled();
    dispose();
  });

  it("dispose tears down the channel and stops timers", async () => {
    harness.state.selectResponses.push({ data: [], error: null }); // baseline empty
    const batches: ProjectSyncEventRow[][] = [];
    const dispose = subscribeToProjectSyncEvents({
      projectId: "project-1",
      onEvents: (events) => batches.push(events),
    });
    await flushAsync();
    harness.state.channelCallback?.({ new: row(1) });
    dispose();
    expect(harness.state.unsubscribe).toHaveBeenCalledTimes(1);
    await flushAsync(30_000);
    expect(batches).toEqual([]); // pending coalesce flush was cancelled
  });
});
