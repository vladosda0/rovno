import { describe, expect, it } from "vitest";
import { isCrawlerAssetFetchFailure, isWalletProviderRejection } from "./third-party-noise";

describe("isWalletProviderRejection", () => {
  it("matches the plain JSON-RPC objects wallet extensions reject with", () => {
    expect(isWalletProviderRejection({ code: -32603, message: "Internal JSON-RPC error" })).toBe(true);
    expect(isWalletProviderRejection({ code: -32000, message: "Invalid input" })).toBe(true);
    expect(isWalletProviderRejection({ code: -32768, message: "Reserved" })).toBe(true);
    expect(isWalletProviderRejection({ code: 4001, message: "User rejected the request." })).toBe(true);
    expect(isWalletProviderRejection({ code: 4900, message: "Disconnected" })).toBe(true);
  });

  it("leaves everything this codebase can produce alone", () => {
    expect(isWalletProviderRejection(new Error("Internal JSON-RPC error"))).toBe(false);
    // A real Error carries a stack worth reporting, whatever code is hung on it.
    expect(
      isWalletProviderRejection(Object.assign(new Error("Internal JSON-RPC error"), { code: -32603 })),
    ).toBe(false);
    expect(isWalletProviderRejection({ code: "NO_SESSION", message: "No authenticated session" })).toBe(false);
    expect(
      isWalletProviderRejection({ code: "42501", message: "permission denied", details: "", hint: "" }),
    ).toBe(false);
    expect(isWalletProviderRejection({ code: -31999, message: "outside the reserved range" })).toBe(false);
    expect(isWalletProviderRejection({ code: 4002, message: "not an EIP-1193 code" })).toBe(false);
    expect(isWalletProviderRejection({ code: "-32603", message: "a string code is not ours" })).toBe(false);
    expect(isWalletProviderRejection({ code: -32603 })).toBe(false);
    expect(isWalletProviderRejection("Internal JSON-RPC error")).toBe(false);
    expect(isWalletProviderRejection(null)).toBe(false);
    expect(isWalletProviderRejection(undefined)).toBe(false);
  });
});

const BOT = "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots) Chrome/108.0.0.0";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IMPORT_FAILURE = new TypeError(
  "Failed to fetch dynamically imported module: https://rovno.ai/assets/AppLayout-L1RNnNsT.js",
);

describe("isCrawlerAssetFetchFailure", () => {
  it("drops the lazy-import abort a crawler causes", () => {
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, BOT)).toBe(true);
  });

  it("keeps the same failure when a real browser hits it", () => {
    // This IS Chromium's own message, so a real Chrome user raises it verbatim. The
    // User-Agent is the only thing that separates them, which is why it is checked first.
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, CHROME)).toBe(false);
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, SAFARI)).toBe(false);
  });

  it("keeps every other error a crawler can raise", () => {
    expect(isCrawlerAssetFetchFailure(new TypeError("boom"), BOT)).toBe(false);
    // The three asset-fetch shapes seen only from real browsers stay reportable.
    expect(isCrawlerAssetFetchFailure(new TypeError("Unable to preload CSS for /assets/a.css"), BOT)).toBe(false);
    expect(isCrawlerAssetFetchFailure(new TypeError("Importing a module script failed."), BOT)).toBe(false);
    expect(
      isCrawlerAssetFetchFailure(new TypeError("'text/html' is not a valid JavaScript MIME type."), BOT),
    ).toBe(false);
  });

  it("leaves every crawler the measurement did not cover reporting", () => {
    // Scoped to what was observed. Suppressing a crawler that has never produced this
    // would hide, say, a Googlebot-only render failure, which is signal on a product
    // whose SEO pipeline is load-bearing.
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
    ]) {
      expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, ua)).toBe(false);
    }
  });

  it("does not match a real browser whose UA merely looks bot-adjacent", () => {
    for (const ua of [
      // Yandex's own BROWSER, which is a real user, unlike YandexBot.
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 YaSearchBrowser/24.10",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
    ]) {
      expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, ua)).toBe(false);
    }
  });

  it("handles a non-Error value without throwing", () => {
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE.message, BOT)).toBe(true);
    expect(isCrawlerAssetFetchFailure(null, BOT)).toBe(false);
    expect(isCrawlerAssetFetchFailure(undefined, BOT)).toBe(false);
    expect(isCrawlerAssetFetchFailure({ message: 1 }, BOT)).toBe(false);
  });

  it("does not throw on an Error whose message is not a string", () => {
    // A throw inside beforeSend is re-captured by the SDK as an internal event, which
    // skips beforeSend and therefore skips the scrubber — worse than the noise it filters.
    for (const message of [{ code: 1 }, 42, null, undefined]) {
      const broken = Object.assign(new TypeError("placeholder"), { message });
      expect(() => isCrawlerAssetFetchFailure(broken, BOT)).not.toThrow();
      expect(isCrawlerAssetFetchFailure(broken, BOT)).toBe(false);
    }
  });

  it("is not stateful across calls", () => {
    // A /g regex used with .test() advances lastIndex and alternates results.
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, BOT)).toBe(true);
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, BOT)).toBe(true);
    expect(isCrawlerAssetFetchFailure(IMPORT_FAILURE, BOT)).toBe(true);
  });
});
