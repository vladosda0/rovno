import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPasskeyAvailabilityForTests, passkeysEnabledOnServer } from "@/lib/passkey-availability";

describe("passkeysEnabledOnServer", () => {
  beforeEach(() => {
    __resetPasskeyAvailabilityForTests();
    vi.stubEnv("VITE_SUPABASE_URL", "https://stand.supabase.co/");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "pk");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks Auth's settings once per tab with the client key and believes only a literal true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ passkeys_enabled: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await passkeysEnabledOnServer()).toBe(true);
    expect(await passkeysEnabledOnServer()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://stand.supabase.co/auth/v1/settings");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ apikey: "pk" });
  });

  it.each([
    ["false", () => Promise.resolve(new Response(JSON.stringify({ passkeys_enabled: false }), { status: 200 }))],
    ["missing", () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))],
    ["a string", () => Promise.resolve(new Response(JSON.stringify({ passkeys_enabled: "true" }), { status: 200 }))],
    ["a 500", () => Promise.resolve(new Response("oops", { status: 500 }))],
    ["a network error", () => Promise.reject(new TypeError("offline"))],
  ])("%s counts as off", async (_label, answer) => {
    vi.stubGlobal("fetch", vi.fn(answer));
    expect(await passkeysEnabledOnServer()).toBe(false);
  });

  it("a hanging request counts as off after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))),
    );
    const pending = passkeysEnabledOnServer();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBe(false);
    vi.useRealTimers();
  });
});
