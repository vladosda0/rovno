import { beforeEach, describe, expect, it, vi } from "vitest";
import { startExternalAuth, takeStartedAttempt } from "@/lib/external-login";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

describe("external-login", () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });
  });

  it("remembers the attempt in this tab and goes to Yandex", async () => {
    invokeMock.mockResolvedValue({ data: { outcome: "redirect", url: "https://oauth.yandex.ru/x", state: "s1" }, error: null });
    await expect(startExternalAuth("yandex", "login", "/invite/accept/a")).resolves.toBe(true);
    expect(assignMock).toHaveBeenCalledWith("https://oauth.yandex.ru/x");
    expect(takeStartedAttempt("yandex", "s1")).toEqual({ state: "s1", mode: "login", next: "/invite/accept/a" });
  });

  it("stays on the page when the attempt did not start", async () => {
    invokeMock.mockResolvedValue({ data: { outcome: "failed" }, error: null });
    await expect(startExternalAuth("yandex", "link", null)).resolves.toBe(false);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("gives an attempt out once, and only for its own state", () => {
    const attempt = JSON.stringify({ state: "s1", mode: "login", next: null });
    sessionStorage.setItem("rovno.yandex-login-attempt", attempt);
    expect(takeStartedAttempt("yandex", "other")).toBeNull();
    sessionStorage.setItem("rovno.yandex-login-attempt", attempt);
    expect(takeStartedAttempt("yandex", "s1")?.state).toBe("s1");
    expect(takeStartedAttempt("yandex", "s1")).toBeNull();
  });
});
