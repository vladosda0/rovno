import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { orgNameForInvites, type OrgSummary } from "@/data/org-source";

const org: OrgSummary = {
  id: "o1",
  name: "ООО Ремонт",
  slug: "remont",
  role: "owner",
  memberCount: 1,
  isActiveContext: true,
  limited: false,
};

describe("orgNameForInvites (rovno#327)", () => {
  it("offers a full organization in the invite", () => {
    expect(orgNameForInvites(org)).toBe("ООО Ремонт");
  });

  it("does not offer a visitka-only organization without Brigade", () => {
    expect(orgNameForInvites({ ...org, limited: true })).toBeNull();
  });

  it("offers nothing without an active organization", () => {
    expect(orgNameForInvites(null)).toBeNull();
  });
});
