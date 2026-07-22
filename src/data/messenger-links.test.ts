import { afterEach, describe, expect, it, vi } from "vitest";

// TELEGRAM_LINKING_ENABLED / TELEGRAM_BOT_USERNAME are resolved from
// import.meta.env at module scope, so each case needs a fresh module registry
// after stubbing rather than a plain top-level import.
async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return await import("@/data/messenger-links");
}

describe("messenger-links env gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("enables linking when both the flag and a bot handle are set", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "true",
      VITE_TELEGRAM_BOT_USERNAME: "rovnoai_bot",
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(true);
    expect(m.TELEGRAM_BOT_USERNAME).toBe("rovnoai_bot");
  });

  // The whole point of the fail-closed gate: a build that turns the flag on but
  // forgets its own handle must not deep-link users into another env's bot.
  it("stays disabled when the flag is on but the handle is missing", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "true",
      VITE_TELEGRAM_BOT_USERNAME: undefined,
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(false);
  });

  it("stays disabled when a handle is set but the flag is off", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "",
      VITE_TELEGRAM_BOT_USERNAME: "rovnoai_bot",
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(false);
  });

  it("requires the exact string 'true', not any truthy value", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "1",
      VITE_TELEGRAM_BOT_USERNAME: "rovnoai_bot",
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(false);
  });

  it("tolerates a leading @ and surrounding whitespace in the handle", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "true",
      VITE_TELEGRAM_BOT_USERNAME: "  @rovnoai_bot  ",
    });
    expect(m.TELEGRAM_BOT_USERNAME).toBe("rovnoai_bot");
    expect(m.telegramDeepLink("ABC123")).toBe("https://t.me/rovnoai_bot?start=ABC123");
  });

  it("treats a whitespace-only handle as unset", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "true",
      VITE_TELEGRAM_BOT_USERNAME: "   ",
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(false);
  });

  // A malformed handle must fail closed exactly like a missing one: the gate
  // exists to prevent dead-end flows, and a broken t.me link is a dead end.
  it.each([
    { label: "double @", value: "@@rovnoai_bot" },
    { label: "inner space", value: "@ rovnoai_bot" },
    { label: "query chars", value: "rovnoai_bot?x=1" },
    { label: "slash", value: "rovnoai/bot" },
    { label: "unicode", value: "ровно_бот" },
    { label: "too short", value: "bot" },
    { label: "too long", value: "a".repeat(33) },
  ])("treats a malformed handle ($label) as unset", async ({ value }) => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "true",
      VITE_TELEGRAM_BOT_USERNAME: value,
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(false);
    expect(m.TELEGRAM_BOT_USERNAME).toBe("");
  });

  it("trims a padded flag value before comparing", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "  true  ",
      VITE_TELEGRAM_BOT_USERNAME: "rovnoai_bot",
    });
    expect(m.TELEGRAM_LINKING_ENABLED).toBe(true);
  });

  it("builds a deep link that url-encodes the code", async () => {
    const m = await loadWith({
      VITE_TELEGRAM_LINKING_ENABLED: "true",
      VITE_TELEGRAM_BOT_USERNAME: "rovnoai_bot",
    });
    expect(m.telegramDeepLink("a b/c")).toBe("https://t.me/rovnoai_bot?start=a%20b%2Fc");
  });
});
