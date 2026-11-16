import { beforeEach, describe, expect, it, vi } from "vitest";
import { dropPendingLink, savePendingLink, startExternalAuth, takePendingLink, takeStartedAttempt } from "@/lib/external-login";

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

  it("keeps a link waiting for the six digits once, for 15 minutes", () => {
    const t0 = Date.parse("2026-11-13T12:00:00Z");
    savePendingLink("vk", "t1", "u1", t0);
    expect(takePendingLink("u1", t0 + 60_000)).toEqual({ provider: "vk", token: "t1", userId: "u1", savedAt: t0 });
    expect(takePendingLink("u1", t0 + 60_000)).toBeNull();
    savePendingLink("yandex", "t2", "u1", t0);
    expect(takePendingLink("u1", t0 + 15 * 60_000 + 1)).toBeNull();
    savePendingLink("yandex", "t3", "u1", t0);
    dropPendingLink();
    expect(takePendingLink("u1", t0)).toBeNull();
    sessionStorage.setItem("rovno.external-link-after-mfa", "{not json");
    expect(takePendingLink("u1", t0)).toBeNull();
  });

  it("never hands a waiting link to another account signing in in the same tab", () => {
    const t0 = Date.parse("2026-11-13T12:00:00Z");
    savePendingLink("vk", "t1", "u1", t0);
    expect(takePendingLink("u2", t0)).toBeNull();
    savePendingLink("vk", "t1", "u1", t0);
    expect(takePendingLink(null, t0)).toBeNull();
  });
});
