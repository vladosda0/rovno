import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadClientInfo,
  loadOrgCard,
  saveClientInfo,
  saveOrgCard,
  type OrgCardScope,
} from "@/data/org-card-source";

type Result = { data: unknown; error: unknown };

/** Rows per table keyed by the owning id; records every upsert. */
function fakeSupabase(
  rows: Record<string, Record<string, unknown>>,
  options: { failUpsert?: boolean; writtenMeanwhile?: { table: string; id: string; row: Record<string, unknown> } } = {},
) {
  const upserts: { table: string; row: Record<string, unknown>; onConflict?: string; ignoreDuplicates?: boolean }[] = [];
  const client = {
    from: vi.fn((table: string) => {
      let id: unknown = null;
      const query = {
        select: () => query,
        eq: (_column: string, value: unknown) => {
          id = value;
          return query;
        },
        maybeSingle: (): Promise<Result> =>
          Promise.resolve({ data: (rows[table] as Record<string, unknown> | undefined)?.[String(id)] ?? null, error: null }),
        upsert: (row: Record<string, unknown>, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          upserts.push({ table, row, onConflict: opts?.onConflict, ignoreDuplicates: opts?.ignoreDuplicates });
          const meanwhile = options.writtenMeanwhile;
          if (meanwhile && meanwhile.table === table) {
            rows[table] = { ...(rows[table] ?? {}), [meanwhile.id]: meanwhile.row };
          }
          const key = opts?.onConflict ? String(row[opts.onConflict]) : "";
          const existing = rows[table]?.[key];
          if (!options.failUpsert && !(existing && opts?.ignoreDuplicates)) {
            rows[table] = { ...(rows[table] ?? {}), [key]: row };
          }
          return Promise.resolve(
            options.failUpsert ? { data: null, error: { message: "denied" } } : { data: null, error: null },
          );
        },
      };
      return query;
    }),
  };
  return { client: client as never, upserts };
}

const orgScope = (canEdit = true): OrgCardScope => ({ kind: "org", orgId: "org-1", canEdit });

beforeEach(() => {
  window.localStorage.clear();
});

describe("contractor requisites on the server", () => {
  it("reads the organization row and maps it into the form", async () => {
    const fake = fakeSupabase({
      org_requisites: { "org-1": { legal_name: "ООО Ровно", inn: "7707083893", bank_name: null, signatory_name: "Иванов" } },
    });
    expect(await loadOrgCard(fake.client, orgScope())).toEqual({
      legalName: "ООО Ровно",
      inn: "7707083893",
      signatoryName: "Иванов",
    });
    expect(fake.upserts).toEqual([]);
  });

  it("moves the browser copy to the server once when the server has none", async () => {
    window.localStorage.setItem("rovno.orgCard.v1.org-1", JSON.stringify({ legalName: "ООО Локальная", inn: "7700000001" }));
    const fake = fakeSupabase({});
    const card = await loadOrgCard(fake.client, orgScope());
    expect(card).toEqual({ legalName: "ООО Локальная", inn: "7700000001" });
    expect(fake.upserts).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({
      table: "org_requisites",
      onConflict: "org_id",
      row: { org_id: "org-1", legal_name: "ООО Локальная", inn: "7700000001", bank_name: null },
    });
    expect(window.localStorage.getItem("rovno.orgCard.v1.org-1")).not.toBeNull();
  });

  it("does not overwrite requisites another person saved while the browser copy was moving", async () => {
    window.localStorage.setItem("rovno.orgCard.v1.org-1", JSON.stringify({ legalName: "Старое из браузера" }));
    const fake = fakeSupabase({}, {
      writtenMeanwhile: { table: "org_requisites", id: "org-1", row: { org_id: "org-1", legal_name: "Админ сохранил" } },
    });
    const card = await loadOrgCard(fake.client, orgScope());
    expect(card?.legalName).toBe("Админ сохранил");
    expect(fake.upserts[0]).toMatchObject({ ignoreDuplicates: true });
  });

  it("does not overwrite a client another co-owner saved while the browser copy was moving", async () => {
    window.localStorage.setItem("rovno.clientInfo.v1.p1", JSON.stringify({ name: "Старый заказчик" }));
    const fake = fakeSupabase({}, {
      writtenMeanwhile: { table: "project_client_info", id: "p1", row: { project_id: "p1", name: "Заказчик совладельца" } },
    });
    const info = await loadClientInfo(fake.client, { kind: "server", projectId: "p1" });
    expect(info?.name).toBe("Заказчик совладельца");
  });

  it("prefers the server row over the browser copy and does not rewrite it", async () => {
    window.localStorage.setItem("rovno.orgCard.v1.org-1", JSON.stringify({ legalName: "Старое" }));
    const fake = fakeSupabase({ org_requisites: { "org-1": { legal_name: "Напарник заполнил", inn: "7707083893" } } });
    expect((await loadOrgCard(fake.client, orgScope()))?.legalName).toBe("Напарник заполнил");
    expect(fake.upserts).toEqual([]);
  });

  it("a plain member neither moves nor saves the organization requisites", async () => {
    window.localStorage.setItem("rovno.orgCard.v1.org-1", JSON.stringify({ legalName: "Моё" }));
    const fake = fakeSupabase({});
    expect(await loadOrgCard(fake.client, orgScope(false))).toBeNull();
    await saveOrgCard(fake.client, orgScope(false), { legalName: "Правка" });
    expect(fake.upserts).toEqual([]);
  });

  it("takes the INN from the business card when the requisites have none", async () => {
    const fake = fakeSupabase({
      org_requisites: { "org-1": { legal_name: "ООО Ровно", inn: null } },
      contractor_profiles: { "org-1": { inn: "7715284611" } },
    });
    expect(await loadOrgCard(fake.client, orgScope())).toEqual({ legalName: "ООО Ровно", inn: "7715284611" });
    const empty = fakeSupabase({ contractor_profiles: { "org-1": { inn: "7715284611" } } });
    expect(await loadOrgCard(empty.client, orgScope(false))).toEqual({ legalName: "", inn: "7715284611" });
  });

  it("without an organization uses the profile and moves this project's local key there", async () => {
    window.localStorage.setItem("rovno.orgCard.v1.local:p1", JSON.stringify({ legalName: "ИП Петров" }));
    const fake = fakeSupabase({});
    const scope: OrgCardScope = { kind: "profile", profileId: "me", projectId: "p1" };
    expect((await loadOrgCard(fake.client, scope))?.legalName).toBe("ИП Петров");
    expect(fake.upserts[0]).toMatchObject({ table: "profile_requisites", onConflict: "profile_id", row: { profile_id: "me" } });
    await saveOrgCard(fake.client, scope, { legalName: "ИП Петров", bik: "044525974" });
    expect(fake.upserts[1].row).toMatchObject({ profile_id: "me", bik: "044525974" });
  });

  it("a failed move still shows the browser copy", async () => {
    window.localStorage.setItem("rovno.orgCard.v1.org-1", JSON.stringify({ legalName: "ООО Локальная" }));
    const fake = fakeSupabase({}, { failUpsert: true });
    expect((await loadOrgCard(fake.client, orgScope()))?.legalName).toBe("ООО Локальная");
  });

  it("the demo workspace keeps using this browser only", async () => {
    const fake = fakeSupabase({});
    const scope: OrgCardScope = { kind: "device", key: "local:p1" };
    await saveOrgCard(fake.client, scope, { legalName: "Демо" });
    expect(JSON.parse(window.localStorage.getItem("rovno.orgCard.v1.local:p1")!)).toEqual({ legalName: "Демо" });
    expect(await loadOrgCard(fake.client, scope)).toEqual({ legalName: "Демо" });
    expect(fake.client).toBeDefined();
    expect(fake.upserts).toEqual([]);
  });
});

describe("client info on the server", () => {
  it("reads the project row with the signatory", async () => {
    const fake = fakeSupabase({
      project_client_info: { p1: { name: "ООО Заказчик", is_legal_entity: true, inn: "7707083893", address: null, phone: null, email: null, signatory_name: "Орлова" } },
    });
    expect(await loadClientInfo(fake.client, { kind: "server", projectId: "p1" })).toEqual({
      name: "ООО Заказчик",
      isLegalEntity: true,
      inn: "7707083893",
      signatoryName: "Орлова",
    });
  });

  it("moves the browser copy once and saves with upsert on project_id", async () => {
    window.localStorage.setItem("rovno.clientInfo.v1.p1", JSON.stringify({ name: "Петров" }));
    const fake = fakeSupabase({});
    expect(await loadClientInfo(fake.client, { kind: "server", projectId: "p1" })).toEqual({ name: "Петров" });
    expect(fake.upserts[0]).toMatchObject({
      table: "project_client_info",
      onConflict: "project_id",
      row: { project_id: "p1", name: "Петров", is_legal_entity: false },
    });
    await saveClientInfo(fake.client, { kind: "server", projectId: "p1" }, { name: "Петров", phone: "" });
    expect(fake.upserts[1].row).toMatchObject({ phone: null });
  });

  it("a save error reaches the caller", async () => {
    const fake = fakeSupabase({}, { failUpsert: true });
    await expect(saveClientInfo(fake.client, { kind: "server", projectId: "p1" }, { name: "X" })).rejects.toBeTruthy();
    await expect(saveOrgCard(fake.client, orgScope(), { legalName: "X" })).rejects.toBeTruthy();
  });
});
