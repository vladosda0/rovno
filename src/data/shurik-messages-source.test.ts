import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseShurikMessagesSource,
  isMoneyShurikMessage,
  isShownInMessagesPanel,
  mapNotificationRowToShurikMessage,
  readShurikMessageAction,
} from "@/data/shurik-messages-source";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    profile_id: "profile-1",
    project_id: null,
    type: "billing_payment_failed",
    title: "Не прошло списание за подписку",
    body: "Не прошло списание 2 990 ₽ за подписку.",
    is_read: false,
    payload: { action_label: "Обновить карту", action_href: "/settings?tab=billing" },
    created_at: "2026-10-09T06:12:00.000Z",
    read_at: null,
    dedupe_key: "sub-1:payment_failed:1",
    ...overrides,
  };
}

/** Records every call so a test can assert on what reached the database. */
function createFakeSupabase(rows: ReturnType<typeof row>[] = []) {
  const calls: { method: string; args: unknown[] }[] = [];
  const realtimeHandlers: { filter: Record<string, unknown>; handler: () => void }[] = [];
  const channel = {
    on(_kind: string, filter: Record<string, unknown>, handler: () => void) {
      realtimeHandlers.push({ filter, handler });
      return channel;
    },
    subscribe: vi.fn(() => channel),
  };

  function builder() {
    const query = {
      select: (...args: unknown[]) => (calls.push({ method: "select", args }), query),
      update: (...args: unknown[]) => (calls.push({ method: "update", args }), query),
      insert: (...args: unknown[]) => (calls.push({ method: "insert", args }), query),
      delete: (...args: unknown[]) => (calls.push({ method: "delete", args }), query),
      eq: (...args: unknown[]) => (calls.push({ method: "eq", args }), query),
      in: (...args: unknown[]) => (calls.push({ method: "in", args }), query),
      neq: (...args: unknown[]) => (calls.push({ method: "neq", args }), query),
      order: (...args: unknown[]) => (calls.push({ method: "order", args }), query),
      limit: (...args: unknown[]) => (calls.push({ method: "limit", args }), query),
      then: (resolve: (value: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return query;
  }

  const client = {
    from: vi.fn((table: string) => (calls.push({ method: "from", args: [table] }), builder())),
    channel: vi.fn((_topic: string) => channel),
    removeChannel: vi.fn(),
  };

  return { client, calls, realtimeHandlers, channel };
}

type SourceClient = Parameters<typeof createSupabaseShurikMessagesSource>[0];

describe("shurik messages source", () => {
  it("lists the signed-in user's own messages, newest first", async () => {
    const fake = createFakeSupabase([
      row({ id: "msg-2", created_at: "2026-10-09T07:00:00.000Z" }),
      row({ id: "msg-1", is_read: true, read_at: "2026-10-09T06:30:00.000Z" }),
    ]);
    const source = createSupabaseShurikMessagesSource(fake.client as unknown as SourceClient, "profile-1");

    const messages = await source.listMessages();

    expect(messages.map((message) => message.id)).toEqual(["msg-2", "msg-1"]);
    expect(messages[1]).toMatchObject({ user_id: "profile-1", is_read: true, read_at: "2026-10-09T06:30:00.000Z" });
    expect(fake.calls).toContainEqual({ method: "from", args: ["notifications"] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["profile_id", "profile-1"] });
    expect(fake.calls).toContainEqual({ method: "order", args: ["created_at", { ascending: false }] });
  });

  it("leaves Shurik's hint of the day out: it lives in the project chat and in Telegram, not in the messages", async () => {
    const fake = createFakeSupabase([
      row({ id: "msg-2", created_at: "2026-10-09T07:00:00.000Z" }),
      // A database that ignored the filter still does not put the hint on screen.
      row({ id: "hint-1", type: "shurik_hint", title: "Подсказка от Шурика · Дача, баня" }),
    ]);
    const source = createSupabaseShurikMessagesSource(fake.client as unknown as SourceClient, "profile-1");

    const messages = await source.listMessages();

    expect(fake.calls).toContainEqual({ method: "neq", args: ["type", "shurik_hint"] });
    expect(messages.map((message) => message.id)).toEqual(["msg-2"]);
    expect(isShownInMessagesPanel({ type: "shurik_hint" })).toBe(false);
    expect(isShownInMessagesPanel({ type: "briefing" })).toBe(true);
    expect(isShownInMessagesPanel({ type: "billing_payment_failed" })).toBe(true);
  });

  it("writes the read mark with only is_read and read_at, and only to the user's own unread rows", async () => {
    const fake = createFakeSupabase();
    const source = createSupabaseShurikMessagesSource(fake.client as unknown as SourceClient, "profile-1");

    await source.markRead(["msg-1", "msg-2"]);

    const updates = fake.calls.filter((call) => call.method === "update");
    expect(updates).toHaveLength(1);
    const patch = updates[0].args[0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(["is_read", "read_at"]);
    expect(patch.is_read).toBe(true);
    expect(Number.isNaN(Date.parse(String(patch.read_at)))).toBe(false);
    expect(fake.calls).toContainEqual({ method: "in", args: ["id", ["msg-1", "msg-2"]] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["profile_id", "profile-1"] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["is_read", false] });
    expect(fake.calls.some((call) => call.method === "insert" || call.method === "delete")).toBe(false);
  });

  it("sends nothing when there is nothing to mark", async () => {
    const fake = createFakeSupabase();
    const source = createSupabaseShurikMessagesSource(fake.client as unknown as SourceClient, "profile-1");

    await source.markRead([]);

    expect(fake.client.from).not.toHaveBeenCalled();
  });

  it("listens for inserts and updates of the user's rows and never for deletes", () => {
    const fake = createFakeSupabase();
    const source = createSupabaseShurikMessagesSource(fake.client as unknown as SourceClient, "profile-1");
    const onChange = vi.fn();

    const unsubscribe = source.subscribe(onChange);

    expect(fake.realtimeHandlers.map((entry) => entry.filter.event).sort()).toEqual(["INSERT", "UPDATE"]);
    for (const entry of fake.realtimeHandlers) {
      expect(entry.filter).toMatchObject({
        schema: "public",
        table: "notifications",
        filter: "profile_id=eq.profile-1",
      });
    }
    expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);
    expect(fake.client.channel.mock.calls[0][0]).toMatch(/^shurik-messages:profile-1:\d+$/);

    fake.realtimeHandlers[0].handler();
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(fake.client.removeChannel).toHaveBeenCalledWith(fake.channel);
  });

  it("gives every subscription a topic of its own", () => {
    const fake = createFakeSupabase();
    const source = createSupabaseShurikMessagesSource(fake.client as unknown as SourceClient, "profile-1");

    source.subscribe(vi.fn());
    source.subscribe(vi.fn());

    const [first, second] = fake.client.channel.mock.calls.map((call) => call[0]);
    expect(first).not.toBe(second);
  });

  it("treats every billing_ type as a money message and nothing else", () => {
    const message = mapNotificationRowToShurikMessage(row());
    expect(isMoneyShurikMessage(message)).toBe(true);
    expect(isMoneyShurikMessage({ ...message, type: "billing_period_ending" })).toBe(true);
    expect(isMoneyShurikMessage({ ...message, type: "deadline_soon" })).toBe(false);
    expect(isMoneyShurikMessage({ ...message, type: "rebilling_note" })).toBe(false);
  });

  it("reads one in-app button from the payload and refuses anything that leaves the app", () => {
    const message = mapNotificationRowToShurikMessage(row());
    expect(readShurikMessageAction(message)).toEqual({ label: "Обновить карту", href: "/settings?tab=billing" });

    const withPayload = (payload: Record<string, unknown>) => ({ ...message, payload });
    expect(readShurikMessageAction(withPayload({}))).toBeNull();
    expect(readShurikMessageAction(withPayload({ action_label: "Оплатить" }))).toBeNull();
    expect(readShurikMessageAction(withPayload({ action_label: "", action_href: "/settings" }))).toBeNull();
    expect(readShurikMessageAction(withPayload({ action_label: "Оплатить", action_href: "https://evil.example" }))).toBeNull();
    expect(readShurikMessageAction(withPayload({ action_label: "Оплатить", action_href: "//evil.example" }))).toBeNull();
    expect(readShurikMessageAction(withPayload({ action_label: "Оплатить", action_href: "/\\evil.example" }))).toBeNull();
    expect(readShurikMessageAction(withPayload({ action_label: "Оплатить", action_href: "javascript:alert(1)" }))).toBeNull();
    for (const href of ["/\t/evil.example", "/\n/evil.example", "/\t\\evil.example", "/settings\\x", "/a b", "/\r/evil.example", "/..//evil.example", "/.//evil.example"]) {
      expect(readShurikMessageAction(withPayload({ action_label: "Оплатить", action_href: href }))).toBeNull();
    }
    expect(readShurikMessageAction(withPayload({ action_label: "Оплатить", action_href: "/billing/checkout?plan=master#pay" })))
      .toEqual({ label: "Оплатить", href: "/billing/checkout?plan=master#pay" });
  });
});
