import { beforeEach, describe, expect, it, vi } from "vitest";
import { startYandexAuth, takeStartedAttempt } from "@/lib/yandex-login";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

describe("yandex-login", () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });
  });

  it("remembers the attempt in this tab and goes to Yandex", async () => {
    invokeMock.mockResolvedValue({ data: { outcome: "redirect", url: "https://oauth.yandex.ru/x", state: "s1" }, error: null });
    await expect(startYandexAuth("login", "/invite/accept/a")).resolves.toBe(true);
    expect(assignMock).toHaveBeenCalledWith("https://oauth.yandex.ru/x");
    expect(takeStartedAttempt("s1")).toEqual({ state: "s1", mode: "login", next: "/invite/accept/a" });
  });

  it("stays on the page when the attempt did not start", async () => {
    invokeMock.mockResolvedValue({ data: { outcome: "failed" }, error: null });
    await expect(startYandexAuth("link", null)).resolves.toBe(false);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("gives an attempt out once, and only for its own state", () => {
    const attempt = JSON.stringify({ state: "s1", mode: "login", next: null });
    sessionStorage.setItem("rovno.yandex-login-attempt", attempt);
    expect(takeStartedAttempt("other")).toBeNull();
    sessionStorage.setItem("rovno.yandex-login-attempt", attempt);
    expect(takeStartedAttempt("s1")?.state).toBe("s1");
    expect(takeStartedAttempt("s1")).toBeNull();
  });
});
