import { beforeEach, describe, expect, it } from "vitest";
import { cacheWorkspaceUsers, __unsafeResetWorkspaceUserCacheForTests } from "@/data/workspace-profile-cache";
import {
  __unsafeResetStoreForTests,
  addProject,
  getCurrentUser,
  getProjects,
  getUserById,
} from "@/data/store";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  enterDemoSession,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";

describe("store", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    __unsafeResetWorkspaceUserCacheForTests();
    __unsafeResetStoreForTests();
  });

  it("returns cached workspace users before falling back to seeded demo users in local mode", () => {
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
    expect(getUserById("user-3")?.name).toBe("Дмитрий Соколов");
  });

  it("ignores cached workspace users while demo session is active", () => {
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
    enterDemoSession("project-1");
    __unsafeResetStoreForTests();

    expect(getCurrentUser()).toMatchObject({
      id: "user-1",
      email: "alex@rovno.ai",
      name: "Алексей Петров",
    });
    expect(getUserById("user-2")?.name).toBe("Мария Иванова");
  });

  it("starts authenticated local workspaces empty instead of inheriting demo projects", () => {
    setStoredAuthProfile({
      email: "new-user@example.com",
      name: "New User",
    });
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    expect(getCurrentUser()).toMatchObject({
      email: "new-user@example.com",
      name: "New User",
    });
    expect(getProjects()).toEqual([]);
  });

  it("hydrates persisted demo state from session storage during the active demo session", () => {
    enterDemoSession("project-1");
    __unsafeResetStoreForTests();

    addProject({
      id: "project-demo-persisted",
      owner_id: "user-1",
      title: "Persisted Demo Project",
      type: "residential",
      automation_level: "manual",
      current_stage_id: "",
      progress_pct: 0,
    });

    expect(getProjects().some((project) => project.id === "project-demo-persisted")).toBe(true);

    __unsafeResetStoreForTests();

    expect(getProjects().some((project) => project.id === "project-demo-persisted")).toBe(true);
  });

  it("sanitizes polluted persisted demo user identity before reads", () => {
    sessionStorage.setItem(
      "workspace-demo-state",
      JSON.stringify({
        user: {
          id: "real-user-id",
          email: "real@example.com",
          name: "Real User",
          locale: "en",
          timezone: "UTC",
          plan: "pro",
          credits_free: 0,
          credits_paid: 999,
        },
      }),
    );

    enterDemoSession("project-1");
    __unsafeResetStoreForTests();

    expect(getCurrentUser()).toMatchObject({
      id: "user-1",
      email: "alex@rovno.ai",
      name: "Алексей Петров",
    });
  });
});
