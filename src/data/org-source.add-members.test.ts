import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "profile-owner";
const upsert = vi.fn();
let profiles: Array<{ id: string; email: string }>;
let ownerProfileId: string | null;
let orgError: { message: string } | null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ in: async () => ({ data: profiles, error: null }) }) };
      }
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: ownerProfileId ? { owner_profile_id: ownerProfileId } : null,
                error: orgError,
              }),
            }),
          }),
        };
      }
      if (table === "org_members") {
        return { upsert: (...args: unknown[]) => upsert(...args) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { addOrgMembersByEmail } from "@/data/org-source";

describe("addOrgMembersByEmail", () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    ownerProfileId = OWNER_ID;
    orgError = null;
    profiles = [
      { id: OWNER_ID, email: "owner@example.com" },
      { id: "profile-colleague", email: "colleague@example.com" },
    ];
  });

  it("adds the colleague when the owner's own address is in the list", async () => {
    const result = await addOrgMembersByEmail("org-1", [
      "Owner@example.com",
      "colleague@example.com",
      "stranger@example.com",
    ]);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toEqual([
      { org_id: "org-1", profile_id: "profile-colleague", role: "member" },
    ]);
    expect(result).toEqual({
      added: ["colleague@example.com"],
      notFound: ["stranger@example.com"],
    });
  });

  it("sends no insert when the owner's address is the only match", async () => {
    profiles = [{ id: OWNER_ID, email: "owner@example.com" }];

    const result = await addOrgMembersByEmail("org-1", ["owner@example.com"]);

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ added: [], notFound: [] });
  });

  it("inserts every match when the organization row is not readable", async () => {
    ownerProfileId = null;

    const result = await addOrgMembersByEmail("org-1", ["owner@example.com", "colleague@example.com"]);

    expect(upsert.mock.calls[0][0]).toHaveLength(2);
    expect(result.added).toEqual(["owner@example.com", "colleague@example.com"]);
  });

  it("adds nobody when the organization read fails", async () => {
    orgError = { message: "upstream 503" };

    await expect(addOrgMembersByEmail("org-1", ["colleague@example.com"])).rejects.toEqual(orgError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("reports unknown addresses without reading the organization", async () => {
    profiles = [];
    orgError = { message: "upstream 503" };

    const result = await addOrgMembersByEmail("org-1", ["stranger@example.com"]);

    expect(result).toEqual({ added: [], notFound: ["stranger@example.com"] });
  });
});
