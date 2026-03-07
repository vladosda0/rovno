import { beforeEach, describe, expect, it } from "vitest";
import { cacheWorkspaceUsers, __unsafeResetWorkspaceUserCacheForTests } from "@/data/workspace-profile-cache";
import { getUserById } from "@/data/store";

describe("store.getUserById", () => {
  beforeEach(() => {
    __unsafeResetWorkspaceUserCacheForTests();
  });

  it("returns cached workspace users before falling back to seeded demo users", () => {
    cacheWorkspaceUsers([
      {
        id: "user-2",
        email: "supabase@example.com",
        name: "Supabase Maria",
        locale: "en",
        timezone: "UTC",
        plan: "pro",
        credits_free: 0,
        credits_paid: 100,
      },
    ]);

    expect(getUserById("user-2")?.name).toBe("Supabase Maria");
    expect(getUserById("user-3")?.name).toBe("Dmitry Sokolov");
  });
});
