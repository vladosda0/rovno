import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserBriefingSettingsSource,
  createSupabaseBriefingSettingsSource,
  DEFAULT_BRIEFING_SETTINGS,
} from "@/data/briefing-settings-source";
import * as store from "@/data/store";

type Result = { data: unknown; error: unknown };

/** One table = one canned answer per verb; every call is recorded per query. */
function createFakeSupabase(
  answers: Record<string, Partial<Record<"select" | "upsert" | "insert" | "delete", Result>> & { selectOf?: (columns: string) => Result | undefined }>,
) {
  const queries: { table: string; calls: { method: string; args: unknown[] }[] }[] = [];

  const client = {
    from: vi.fn((table: string) => {
      const calls: { method: string; args: unknown[] }[] = [];
      queries.push({ table, calls });
      let verb: "select" | "upsert" | "insert" | "delete" = "select";
      let columns = "";
      const answer = () =>
        (verb === "select" ? answers[table]?.selectOf?.(columns) : undefined)
        ?? answers[table]?.[verb]
        ?? { data: verb === "select" ? [] : null, error: null };
      const record = (method: string) => (...args: unknown[]) => {
        calls.push({ method, args });
        if (method === "select") columns = String(args[0] ?? "");
        if (method === "upsert" || method === "insert" || method === "delete") verb = method;
        return query;
      };
      const query = {
        select: record("select"),
        upsert: record("upsert"),
        insert: record("insert"),
        delete: record("delete"),
        eq: record("eq"),
        is: record("is"),
        in: record("in"),
        order: record("order"),
        maybeSingle: () => Promise.resolve(answer()),
        then: (resolve: (value: Result) => void) => resolve(answer()),
      };
      return query;
    }),
  };

  const queriesOf = (table: string) => queries.filter((query) => query.table === table);
  return { client, queriesOf };
}

function source(fake: ReturnType<typeof createFakeSupabase>, profileId = "me") {
  return createSupabaseBriefingSettingsSource(fake.client as never, profileId);
}

describe("hints in the project chat, the database", () => {
  it("reads the switch on its own and writes that one value", async () => {
    const fake = createFakeSupabase({
      notification_preferences: {
        selectOf: (columns) => (columns === "hints_chat_enabled" ? { data: { hints_chat_enabled: false }, error: null } : undefined),
        select: { data: null, error: null },
      },
    });

    expect((await source(fake).load()).hintsChatEnabled).toBe(false);

    await source(fake).setHintsChatEnabled(true);
    const write = fake.queriesOf("notification_preferences").at(-1)!;
    expect(write.calls[0]).toEqual({
      method: "upsert",
      args: [{ profile_id: "me", hints_chat_enabled: true }, { onConflict: "profile_id" }],
    });
  });

  it("keeps the rest of the settings, and the hints on, when the database has no such column yet", async () => {
    const fake = createFakeSupabase({
      notification_preferences: {
        selectOf: (columns) =>
          columns === "hints_chat_enabled" ? { data: null, error: { code: "42703", message: "column does not exist" } } : undefined,
        select: {
          data: { briefing_enabled: false, briefing_minute: 540, briefing_weekends: false, people_enabled: true },
          error: null,
        },
      },
    });

    const snapshot = await source(fake).load();
    expect(snapshot.settings.enabled).toBe(false);
    expect(snapshot.hintsChatEnabled).toBe(true);
  });

  it("keeps the choice on this device without a backend", async () => {
    localStorage.clear();
    const local = createBrowserBriefingSettingsSource("local");
    await local.setHintsChatEnabled(false);
    expect((await createBrowserBriefingSettingsSource("local").load()).hintsChatEnabled).toBe(false);
  });
});

describe("the most important hint in Telegram, the database", () => {
  it("reads the switch on its own and writes that one value", async () => {
    const fake = createFakeSupabase({
      notification_preferences: {
        selectOf: (columns) =>
          columns === "hints_telegram_enabled" ? { data: { hints_telegram_enabled: false }, error: null } : undefined,
        select: { data: null, error: null },
      },
    });

    const snapshot = await source(fake).load();
    expect(snapshot.hintsTelegramEnabled).toBe(false);
    expect(snapshot.hintsChatEnabled).toBe(true);

    await source(fake).setHintsTelegramEnabled(true);
    const write = fake.queriesOf("notification_preferences").at(-1)!;
    expect(write.calls[0]).toEqual({
      method: "upsert",
      args: [{ profile_id: "me", hints_telegram_enabled: true }, { onConflict: "profile_id" }],
    });
  });

  it("keeps the rest of the settings, and the switch on, when the database has no such column yet", async () => {
    const fake = createFakeSupabase({
      notification_preferences: {
        selectOf: (columns) =>
          columns === "hints_telegram_enabled"
            ? { data: null, error: { code: "42703", message: "column does not exist" } }
            : columns === "hints_chat_enabled" ? { data: { hints_chat_enabled: false }, error: null } : undefined,
        select: {
          data: { briefing_enabled: false, briefing_minute: 540, briefing_weekends: false, people_enabled: true },
          error: null,
        },
      },
    });

    const snapshot = await source(fake).load();
    expect(snapshot.settings.enabled).toBe(false);
    expect(snapshot.hintsChatEnabled).toBe(false);
    expect(snapshot.hintsTelegramEnabled).toBe(true);
  });

  it("keeps the choice on this device without a backend, apart from the chat switch", async () => {
    localStorage.clear();
    const local = createBrowserBriefingSettingsSource("local");
    await local.setHintsTelegramEnabled(false);
    const snapshot = await createBrowserBriefingSettingsSource("local").load();
    expect(snapshot.hintsTelegramEnabled).toBe(false);
    expect(snapshot.hintsChatEnabled).toBe(true);
  });
});

describe("briefing settings, the database", () => {
  it("gives the defaults to a person with no preferences row: on, 09:00, no weekends", async () => {
    const fake = createFakeSupabase({ notification_preferences: { select: { data: null, error: null } } });

    const snapshot = await source(fake).load();

    expect(snapshot.settings).toEqual({ enabled: true, minute: 540, weekends: false });
    expect(snapshot.settings).toEqual(DEFAULT_BRIEFING_SETTINGS);
    expect(snapshot.projects).toEqual([]);
    expect(snapshot.inAnyProject).toBe(false);
    expect(snapshot.mutedProjectIds).toEqual([]);
    expect(snapshot.peopleEnabled).toBe(true);
  });

  it("reads whether messages from people are on, from the same row", async () => {
    const fake = createFakeSupabase({
      notification_preferences: {
        select: {
          data: { briefing_enabled: true, briefing_minute: 540, briefing_weekends: false, people_enabled: false },
          error: null,
        },
      },
    });

    const snapshot = await source(fake).load();

    expect(snapshot.peopleEnabled).toBe(false);
    expect(fake.queriesOf("notification_preferences")[0].calls[0]).toEqual({
      method: "select",
      args: ["briefing_enabled, briefing_minute, briefing_weekends, people_enabled"],
    });
  });

  it.each([false, true])("writes messages from people = %j as that column alone, creating the row when there is none", async (enabled) => {
    const fake = createFakeSupabase({});

    await source(fake).setPeopleEnabled(enabled);

    const [write] = fake.queriesOf("notification_preferences");
    expect(write.calls[0]).toEqual({
      method: "upsert",
      args: [{ profile_id: "me", people_enabled: enabled }, { onConflict: "profile_id" }],
    });
  });

  it("raises a refused write of messages from people", async () => {
    const fake = createFakeSupabase({ notification_preferences: { upsert: { data: null, error: new Error("refused") } } });

    await expect(source(fake).setPeopleEnabled(false)).rejects.toThrow("refused");
  });

  it("reads the stored settings of this person only", async () => {
    const fake = createFakeSupabase({
      notification_preferences: {
        select: { data: { briefing_enabled: false, briefing_minute: 1110, briefing_weekends: true }, error: null },
      },
    });

    const snapshot = await source(fake).load();

    expect(snapshot.settings).toEqual({ enabled: false, minute: 1110, weekends: true });
    expect(fake.queriesOf("notification_preferences")[0].calls).toContainEqual({ method: "eq", args: ["profile_id", "me"] });
  });

  it("lists the projects where the person is the owner or a co-owner, and no others", async () => {
    const fake = createFakeSupabase({
      projects: {
        select: {
          data: [
            { id: "p-own", title: "Ленина 42", owner_profile_id: "me" },
            { id: "p-co", title: "Дача, баня", owner_profile_id: "other" },
            { id: "p-contractor", title: "Чужой объект", owner_profile_id: "other" },
            { id: "p-viewer", title: "Смотрю", owner_profile_id: "other" },
            { id: "p-no-row", title: "Без строки участника", owner_profile_id: "other" },
            { id: "p-own-member", title: "Офис на Мира", owner_profile_id: "other" },
          ],
          error: null,
        },
      },
      project_members: {
        select: {
          data: [
            { project_id: "p-co", role: "co_owner" },
            { project_id: "p-contractor", role: "contractor" },
            { project_id: "p-viewer", role: "viewer" },
            { project_id: "p-own-member", role: "owner" },
          ],
          error: null,
        },
      },
      notification_project_mutes: { select: { data: [{ project_id: "p-co" }], error: null } },
    });

    const snapshot = await source(fake).load();

    expect(snapshot.projects).toEqual([
      { id: "p-own", title: "Ленина 42" },
      { id: "p-co", title: "Дача, баня" },
      { id: "p-own-member", title: "Офис на Мира" },
    ]);
    expect(snapshot.inAnyProject).toBe(true);
    expect(snapshot.mutedProjectIds).toEqual(["p-co"]);
    expect(fake.queriesOf("projects")[0].calls).toContainEqual({ method: "is", args: ["archived_at", null] });
    expect(fake.queriesOf("project_members")[0].calls).toContainEqual({ method: "eq", args: ["profile_id", "me"] });
    expect(fake.queriesOf("notification_project_mutes")[0].calls).toContainEqual({ method: "eq", args: ["profile_id", "me"] });
  });

  it("tells a person who is only a member somewhere from a person with no projects", async () => {
    const fake = createFakeSupabase({
      projects: { select: { data: [{ id: "p-contractor", title: "Чужой объект", owner_profile_id: "other" }], error: null } },
      project_members: { select: { data: [{ project_id: "p-contractor", role: "contractor" }], error: null } },
    });

    const snapshot = await source(fake).load();

    expect(snapshot.projects).toEqual([]);
    expect(snapshot.inAnyProject).toBe(true);
  });

  it("refuses to pass off a failed read as defaults", async () => {
    const fake = createFakeSupabase({ notification_preferences: { select: { data: null, error: new Error("denied") } } });

    await expect(source(fake).load()).rejects.toThrow("denied");
  });

  it("writes only the changed column, creating the row when there is none", async () => {
    const fake = createFakeSupabase({});

    await source(fake).saveSettings({ minute: 1110 });

    const [write] = fake.queriesOf("notification_preferences");
    expect(write.calls[0]).toEqual({
      method: "upsert",
      args: [{ profile_id: "me", briefing_minute: 1110 }, { onConflict: "profile_id" }],
    });
  });

  it.each([
    [{ enabled: false }, { briefing_enabled: false }],
    [{ weekends: true }, { briefing_weekends: true }],
    [{ enabled: true, minute: 0, weekends: false }, { briefing_enabled: true, briefing_minute: 0, briefing_weekends: false }],
  ])("maps %j to its columns", async (patch, columns) => {
    const fake = createFakeSupabase({});

    await source(fake).saveSettings(patch);

    expect(fake.queriesOf("notification_preferences")[0].calls[0].args[0]).toEqual({ profile_id: "me", ...columns });
  });

  it.each([-30, 15, 1440, 9.5, Number.NaN])("does not send the time %j, which is not a half-hour slot of the day", async (minute) => {
    const fake = createFakeSupabase({});

    await expect(source(fake).saveSettings({ minute })).rejects.toThrow();
    expect(fake.queriesOf("notification_preferences")).toHaveLength(0);
  });

  it("raises a refused settings write", async () => {
    const fake = createFakeSupabase({ notification_preferences: { upsert: { data: null, error: new Error("refused") } } });

    await expect(source(fake).saveSettings({ enabled: false })).rejects.toThrow("refused");
  });

  it("turns a project off by inserting its row", async () => {
    const fake = createFakeSupabase({});

    await source(fake).setProjectMuted("p1", true);

    expect(fake.queriesOf("notification_project_mutes")[0].calls).toEqual([
      { method: "insert", args: [{ profile_id: "me", project_id: "p1" }] },
    ]);
  });

  it("takes a project that is already off as done", async () => {
    const fake = createFakeSupabase({
      notification_project_mutes: { insert: { data: null, error: { code: "23505", message: "duplicate key" } } },
    });

    await expect(source(fake).setProjectMuted("p1", true)).resolves.toBeUndefined();
  });

  it("raises any other refused insert", async () => {
    const fake = createFakeSupabase({
      notification_project_mutes: { insert: { data: null, error: { code: "42501", message: "denied" } } },
    });

    await expect(source(fake).setProjectMuted("p1", true)).rejects.toMatchObject({ code: "42501" });
  });

  it("turns a project back on by deleting this person's row for it, and only that row", async () => {
    const fake = createFakeSupabase({});

    await source(fake).setProjectMuted("p1", false);

    expect(fake.queriesOf("notification_project_mutes")[0].calls).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["profile_id", "me"] },
      { method: "eq", args: ["project_id", "p1"] },
    ]);
  });

  it("raises a refused delete", async () => {
    const fake = createFakeSupabase({ notification_project_mutes: { delete: { data: null, error: new Error("refused") } } });

    await expect(source(fake).setProjectMuted("p1", false)).rejects.toThrow("refused");
  });
});

describe("briefing settings, without a backend", () => {
  beforeEach(() => {
    localStorage.clear();
    store.__unsafeResetStoreForTests();
  });

  it("starts from the defaults and keeps what is changed on this device", async () => {
    const local = createBrowserBriefingSettingsSource("local");
    expect((await local.load()).settings).toEqual(DEFAULT_BRIEFING_SETTINGS);

    await local.saveSettings({ minute: 1110 });
    await local.saveSettings({ weekends: true });
    await local.setProjectMuted("project-1", true);
    await local.setProjectMuted("project-1", true);

    const snapshot = await createBrowserBriefingSettingsSource("local").load();
    expect(snapshot.settings).toEqual({ enabled: true, minute: 1110, weekends: true });
    expect(snapshot.mutedProjectIds).toEqual(["project-1"]);

    await local.setProjectMuted("project-1", false);
    expect((await local.load()).mutedProjectIds).toEqual([]);
  });

  it("keeps messages from people on until switched off, on this device", async () => {
    const local = createBrowserBriefingSettingsSource("local");
    expect((await local.load()).peopleEnabled).toBe(true);

    await local.setPeopleEnabled(false);
    expect((await createBrowserBriefingSettingsSource("local").load()).peopleEnabled).toBe(false);
    expect((await local.load()).settings).toEqual(DEFAULT_BRIEFING_SETTINGS);

    await local.setPeopleEnabled(true);
    expect((await local.load()).peopleEnabled).toBe(true);
  });
});
