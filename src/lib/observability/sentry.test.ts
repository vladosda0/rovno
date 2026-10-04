import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/react", () => ({
  init,
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException,
  captureMessage: vi.fn(),
}));

function fireRejection(reason: unknown) {
  const event = new Event("unhandledrejection") as Event & { reason?: unknown };
  event.reason = reason;
  window.dispatchEvent(event);
}

/** The config object `initErrorTracking` hands to the real SDK. */
async function initAndReadConfig() {
  vi.resetModules();
  vi.stubEnv("VITE_SENTRY_DSN", "https://public@glitchtip.example/1");
  const { initErrorTracking } = await import("./sentry");
  initErrorTracking();
  await vi.waitFor(() => expect(init).toHaveBeenCalled());
  return init.mock.calls[0][0] as {
    beforeSend: (event: unknown, hint?: { originalException?: unknown }) => unknown;
  };
}

describe("beforeSend", () => {
  beforeEach(() => init.mockClear());
  // Restored in afterEach, not at the end of a test body: a failing assertion would
  // otherwise leak the spy into every later test. Scoped to this one spy rather than
  // vi.restoreAllMocks(), which also resets the @sentry/react module mocks.
  let uaSpy: { mockRestore: () => void } | undefined;
  afterEach(() => {
    vi.unstubAllEnvs();
    uaSpy?.mockRestore();
    uaSpy = undefined;
  });

  it("drops a wallet-extension JSON-RPC rejection", async () => {
    const { beforeSend } = await initAndReadConfig();
    const event = { message: "Object captured as exception with keys: code, message" };
    expect(
      beforeSend(event, { originalException: { code: -32603, message: "Internal JSON-RPC error" } }),
    ).toBeNull();
  });

  it("drops a crawler's aborted lazy import, and keeps a real browser's", async () => {
    const { beforeSend } = await initAndReadConfig();
    const event = { message: "Failed to fetch dynamically imported module" };
    const thrown = new TypeError(
      "Failed to fetch dynamically imported module: https://rovno.ai/assets/AppLayout-L1RNnNsT.js",
    );
    const ua = (value: string) => {
      uaSpy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
    };

    ua("Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots) Chrome/108.0.0.0");
    expect(beforeSend(event, { originalException: thrown })).toBeNull();

    ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    expect(beforeSend(event, { originalException: thrown })).not.toBeNull();
  });

  it("keeps a real exception and still scrubs it", async () => {
    const { beforeSend } = await initAndReadConfig();
    const event = { request: { url: "https://rovno.ai/home?access_token=opaque_secret" } };
    const kept = beforeSend(event, { originalException: new Error("boom") }) as typeof event;
    expect(kept).not.toBeNull();
    expect(kept.request.url).toContain("[FILTERED]");
  });
});

describe("the pre-init buffer", () => {
  beforeEach(() => {
    init.mockClear();
    captureException.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not spend a slot on wallet noise, and still replays a real rejection", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@glitchtip.example/1");
    const { initErrorTracking } = await import("./sentry");
    initErrorTracking();

    // Synchronous: the early handlers are attached before the SDK chunk lands.
    for (let i = 0; i < 25; i += 1) {
      fireRejection({ code: -32603, message: "Internal JSON-RPC error" });
    }
    const real = new Error("boom");
    fireRejection(real);

    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    await vi.waitFor(() => expect(captureException).toHaveBeenCalled());
    expect(captureException.mock.calls.map((call) => call[0])).toEqual([real]);
  });
});
