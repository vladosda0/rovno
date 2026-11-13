import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  analyticsDeclined,
  cookieConsentPending,
  getCookieConsentRevision,
  readCookieConsent,
  resetCookieConsentForTests,
  subscribeCookieConsent,
  writeCookieConsent,
} from "./cookie-consent";

describe("cookie consent storage", () => {
  beforeEach(() => {
    localStorage.clear();
    resetCookieConsentForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("reads no record as 'has not chosen': banner pending, analytics not declined", () => {
    expect(readCookieConsent()).toBeNull();
    expect(cookieConsentPending()).toBe(true);
    expect(analyticsDeclined()).toBe(false);
  });

  it("stores 'Хорошо' as analytics: true under the versioned key", () => {
    writeCookieConsent(true);
    const raw = JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) ?? "null");
    expect(raw).toMatchObject({ analytics: true, v: 1 });
    expect(typeof raw.at).toBe("string");
    expect(cookieConsentPending()).toBe(false);
    expect(analyticsDeclined()).toBe(false);
  });

  it("stores a switched-off analytics as declined", () => {
    writeCookieConsent(false);
    expect(analyticsDeclined()).toBe(true);
    expect(readCookieConsent()?.analytics).toBe(false);
  });

  it.each([
    ["broken JSON", "{not json"],
    ["a string", '"yes"'],
    ["null", "null"],
    ["another version", JSON.stringify({ analytics: false, at: "x", v: 2 })],
    ["a non-boolean flag", JSON.stringify({ analytics: "false", at: "x", v: 1 })],
  ])("treats %s as 'has not chosen'", (_label, raw) => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, raw);
    expect(readCookieConsent()).toBeNull();
    expect(analyticsDeclined()).toBe(false);
    expect(cookieConsentPending()).toBe(true);
  });

  it("survives a throwing localStorage: reads as not chosen, a write still answers this page", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readCookieConsent()).toBeNull();
    expect(analyticsDeclined()).toBe(false);
    expect(cookieConsentPending()).toBe(true);

    expect(writeCookieConsent(true)).toBe(false);
    expect(cookieConsentPending()).toBe(false);

    expect(writeCookieConsent(false)).toBe(false);
    expect(analyticsDeclined()).toBe(true);

    expect(writeCookieConsent(true)).toBe(false);
    expect(analyticsDeclined()).toBe(false);
  });

  it("notifies subscribers on write and moves the revision, even when storage refused the write", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCookieConsent(listener);
    const before = getCookieConsentRevision();

    writeCookieConsent(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getCookieConsentRevision()).not.toBe(before);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const afterFirst = getCookieConsentRevision();
    writeCookieConsent(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getCookieConsentRevision()).not.toBe(afterFirst);
    unsubscribe();
  });

  it("takes another tab's readable answer over this page's in-memory one, and keeps it otherwise", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    writeCookieConsent(false);
    setItem.mockRestore();
    expect(analyticsDeclined()).toBe(true);

    const listener = vi.fn();
    const unsubscribe = subscribeCookieConsent(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "some-other-key" }));
    expect(listener).not.toHaveBeenCalled();
    expect(analyticsDeclined()).toBe(true);

    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(analyticsDeclined()).toBe(true);

    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, at: "x", v: 1 }));
    window.dispatchEvent(new StorageEvent("storage", { key: COOKIE_CONSENT_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(analyticsDeclined()).toBe(false);
    unsubscribe();
  });
});
