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
  afterEach(() => vi.unstubAllEnvs());

  it("drops a wallet-extension JSON-RPC rejection", async () => {
    const { beforeSend } = await initAndReadConfig();
    const event = { message: "Object captured as exception with keys: code, message" };
    expect(
      beforeSend(event, { originalException: { code: -32603, message: "Internal JSON-RPC error" } }),
    ).toBeNull();
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
