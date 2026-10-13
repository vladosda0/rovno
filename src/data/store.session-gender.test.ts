import { beforeEach, describe, expect, it } from "vitest";
import { __unsafeResetStoreForTests, getCurrentUserForMode, setCurrentUserGender } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

describe("the gender kept for a demo session", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("owner");
    clearDemoSession();
    __unsafeResetStoreForTests();
  });

  it("is gone after leaving the demo and stays gone on re-entry", () => {
    enterDemoSession("project-1");
    setCurrentUserGender("demo", "female");
    expect(getCurrentUserForMode("demo").gender).toBe("female");

    clearDemoSession();
    expect(getCurrentUserForMode("demo").gender).toBeUndefined();

    enterDemoSession("project-1");
    expect(getCurrentUserForMode("demo").gender).toBeUndefined();
  });
});
