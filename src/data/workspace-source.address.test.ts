// rovno#236: the owner sets the project address on the dashboard and, optionally,
// when creating the project. 0 updated rows means the RLS policy refused (not the
// owner), which must surface as an error rather than a silent "saved".
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ROW = {
  id: "p1",
  owner_profile_id: "u1",
  title: "Ремонт квартиры на Летной",
  project_type: "residential",
  project_mode: "contractor",
  automation_level: "manual",
  current_stage_id: null,
  progress_pct: 0,
  address: "г Москва, ул Летная, д 12",
  ai_description: null,
};

let captured: { update?: Record<string, unknown>; insert?: Record<string, unknown>; eqs: Array<[string, unknown]> };
let updateRows: unknown[];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "project_members") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { project_id: "p1" }, error: null }),
          upsert: async () => ({ error: null }),
          insert: async () => ({ error: null }),
        };
        return chain;
      }
      if (table !== "projects") throw new Error(`unexpected table ${table}`);
      return {
        update: (payload: Record<string, unknown>) => {
          captured.update = payload;
          const chain = {
            eq: (column: string, value: unknown) => {
              captured.eqs.push([column, value]);
              return chain;
            },
            select: async () => ({ data: updateRows, error: null }),
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          captured.insert = payload;
          return {
            select: () => ({
              single: async () => ({ data: { ...PROJECT_ROW, address: payload.address ?? null }, error: null }),
            }),
          };
        },
      };
    },
  },
}));

import {
  getWorkspaceSource,
  normalizeProjectAddress,
  ProjectUpdateNotPermittedError,
} from "@/data/workspace-source";

describe("normalizeProjectAddress", () => {
  it("trims, turns empty into null and caps the length at 300", () => {
    expect(normalizeProjectAddress("  г Москва, ул Летная, д 12 ")).toBe("г Москва, ул Летная, д 12");
    expect(normalizeProjectAddress("   ")).toBeNull();
    expect(normalizeProjectAddress("")).toBeNull();
    expect(normalizeProjectAddress(null)).toBeNull();
    expect(normalizeProjectAddress(undefined)).toBeNull();
    expect(normalizeProjectAddress("а".repeat(400))).toHaveLength(300);
  });
});

describe("supabase updateProjectAddress", () => {
  beforeEach(() => {
    captured = { eqs: [] };
    updateRows = [PROJECT_ROW];
  });

  it("writes the trimmed address, scoped to the project and its owner", async () => {
    const source = await getWorkspaceSource({ kind: "supabase", profileId: "u1" });
    const project = await source.updateProjectAddress("p1", "  г Москва, ул Летная, д 12  ");
    expect(captured.update).toEqual({ address: "г Москва, ул Летная, д 12" });
    expect(captured.eqs).toEqual([["id", "p1"], ["owner_profile_id", "u1"]]);
    expect(project.address).toBe("г Москва, ул Летная, д 12");
  });

  it("writes null when the address is erased", async () => {
    updateRows = [{ ...PROJECT_ROW, address: null }];
    const source = await getWorkspaceSource({ kind: "supabase", profileId: "u1" });
    const project = await source.updateProjectAddress("p1", "   ");
    expect(captured.update).toEqual({ address: null });
    expect(project.address).toBeUndefined();
  });

  it("throws when no row was updated (not the owner)", async () => {
    updateRows = [];
    const source = await getWorkspaceSource({ kind: "supabase", profileId: "u2" });
    await expect(source.updateProjectAddress("p1", "СНТ Рассвет, участок 48")).rejects.toBeInstanceOf(
      ProjectUpdateNotPermittedError,
    );
  });
});

describe("supabase createProject address", () => {
  beforeEach(() => {
    captured = { eqs: [] };
  });

  it("sends the address when one was typed", async () => {
    const source = await getWorkspaceSource({ kind: "supabase", profileId: "u1" });
    await source.createProject({ title: "Дом", type: "residential", projectMode: "contractor", address: " СНТ Рассвет " });
    expect(captured.insert?.address).toBe("СНТ Рассвет");
  });

  it("leaves the column out when the field was empty", async () => {
    const source = await getWorkspaceSource({ kind: "supabase", profileId: "u1" });
    await source.createProject({ title: "Дом", type: "residential", projectMode: "contractor", address: "  " });
    expect(captured.insert).not.toHaveProperty("address");
  });
});

describe("browser updateProjectAddress", () => {
  it("lets the owner set and erase the address, refuses anyone else", async () => {
    const source = await getWorkspaceSource({ kind: "local" });
    const created = await source.createProject({ title: "QA адрес", type: "residential", projectMode: "contractor", address: "г Москва" });
    expect((await source.getProjectById(created.id))?.address).toBe("г Москва");
    await source.updateProjectAddress(created.id, "СНТ Рассвет, участок 48");
    expect((await source.getProjectById(created.id))?.address).toBe("СНТ Рассвет, участок 48");
    await source.updateProjectAddress(created.id, "");
    expect((await source.getProjectById(created.id))?.address).toBeUndefined();
    await expect(source.updateProjectAddress("no-such-project", "x")).rejects.toBeInstanceOf(ProjectUpdateNotPermittedError);
  });
});
