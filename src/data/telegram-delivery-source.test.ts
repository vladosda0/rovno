import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseTelegramDeliverySource,
  DEFAULT_TELEGRAM_DELIVERY_SETTINGS,
  getTelegramDeliverySource,
} from "@/data/telegram-delivery-source";
import type { LinkedIdentity } from "@/data/messenger-links";

vi.mock("@/data/messenger-links", () => ({ listLinkedIdentities: vi.fn(async () => []) }));

type Result = { data: unknown; error: unknown };

function createFakeSupabase(answer: { select?: Result; upsert?: Result }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    let verb: "select" | "upsert" = "select";
    const result = () => answer[verb] ?? { data: null, error: null };
    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "upsert") verb = "upsert";
      return query;
    };
    const query = {
      select: record("select"),
      upsert: record("upsert"),
      eq: record("eq"),
      maybeSingle: () => Promise.resolve(result()),
      then: (resolve: (value: Result) => void) => resolve(result()),
    };
    return query;
  });
  return { client: { from }, calls };
}

const identity = (patch: Partial<LinkedIdentity>): LinkedIdentity => ({
  provider: "telegram",
  username: "ivan_stroit",
  displayName: "Иван",
  linkedAt: "2026-10-01T00:00:00Z",
  ...patch,
});

function source(fake: ReturnType<typeof createFakeSupabase>, identities: LinkedIdentity[]) {
  return createSupabaseTelegramDeliverySource(fake.client as never, "me", async () => identities);
}

describe("telegram delivery settings, the database", () => {
  it("gives the defaults to a person with no preferences row: on, silent at night", async () => {
    const snapshot = await source(createFakeSupabase({}), [identity({})]).load();

    expect(snapshot.settings).toEqual({ enabled: true, quietNight: true });
    expect(snapshot.settings).toEqual(DEFAULT_TELEGRAM_DELIVERY_SETTINGS);
  });

  it("reads the person's own row and what it stores", async () => {
    const fake = createFakeSupabase({
      select: { data: { telegram_enabled: false, telegram_quiet_night: false }, error: null },
    });

    const snapshot = await source(fake, [identity({})]).load();

    expect(snapshot.settings).toEqual({ enabled: false, quietNight: false });
    expect(fake.calls).toContainEqual({ method: "from", args: ["notification_preferences"] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["profile_id", "me"] });
  });

  it("names the linked Telegram by username, else by display name; MAX alone is not a link", async () => {
    const fake = createFakeSupabase({});

    expect(await source(fake, [identity({})]).load()).toMatchObject({ linked: true, linkedName: "@ivan_stroit" });
    expect(await source(fake, [identity({ username: null })]).load()).toMatchObject({ linked: true, linkedName: "Иван" });
    expect(await source(fake, [identity({ username: null, displayName: null })]).load())
      .toMatchObject({ linked: true, linkedName: null });
    expect(await source(fake, [identity({ provider: "max" })]).load()).toMatchObject({ linked: false, linkedName: null });
    expect(await source(fake, []).load()).toMatchObject({ linked: false, linkedName: null });
  });

  it("fails the load when the row cannot be read", async () => {
    const fake = createFakeSupabase({ select: { data: null, error: new Error("denied") } });

    await expect(source(fake, [identity({})]).load()).rejects.toThrow("denied");
  });

  it("writes only the field that changed, onto the person's own row", async () => {
    const fake = createFakeSupabase({});

    await source(fake, []).saveSettings({ enabled: false });
    await source(fake, []).saveSettings({ quietNight: false });

    const upserts = fake.calls.filter((call) => call.method === "upsert");
    expect(upserts).toEqual([
      { method: "upsert", args: [{ profile_id: "me", telegram_enabled: false }, { onConflict: "profile_id" }] },
      { method: "upsert", args: [{ profile_id: "me", telegram_quiet_night: false }, { onConflict: "profile_id" }] },
    ]);
  });

  it("fails the save when the write is refused", async () => {
    const fake = createFakeSupabase({ upsert: { data: null, error: new Error("refused") } });

    await expect(source(fake, []).saveSettings({ enabled: false })).rejects.toThrow("refused");
  });

  it("does not exist outside a signed-in workspace", async () => {
    expect(await getTelegramDeliverySource({ kind: "demo" } as never)).toBeNull();
    expect(await getTelegramDeliverySource({ kind: "local" } as never)).toBeNull();
  });
});
