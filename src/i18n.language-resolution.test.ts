// Language resolution: which language a visitor lands in, and why.
//
// The precedence chain is `?lang=` > stored choice > Russian. The browser's own
// preference is deliberately NOT a rung: it only decides whether English is
// OFFERED anything since the English offer strip was removed (rovno#333). Letting it decide
// the language made one URL render differently per visitor, which made the
// canonical a function of who was asking.
//
// Get this wrong and either shared links open in the wrong language, or a
// returning visitor's own choice is overridden.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStoredLanguage, getUrlLanguage, resolveInitialLanguage } from "@/i18n";

const STORAGE_KEY = "app-language";

function setBrowserLanguages(languages: string[]): void {
  Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
  Object.defineProperty(navigator, "language", { value: languages[0], configurable: true });
}

function setSearch(search: string): void {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  setSearch("");
});

afterEach(() => {
  localStorage.clear();
  setSearch("");
  vi.unstubAllGlobals();
});

describe("getUrlLanguage", () => {
  it("reads a supported ?lang= value", () => {
    expect(getUrlLanguage("?lang=en")).toBe("en");
    expect(getUrlLanguage("?lang=ru")).toBe("ru");
  });

  it("accepts a regional tag and odd casing", () => {
    expect(getUrlLanguage("?lang=en-GB")).toBe("en");
    expect(getUrlLanguage("?lang=RU")).toBe("ru");
  });

  it("ignores a language we do not ship, so the stored choice still decides", () => {
    expect(getUrlLanguage("?lang=de")).toBeNull();
    expect(getUrlLanguage("?lang=")).toBeNull();
    expect(getUrlLanguage("?other=en")).toBeNull();
    expect(getUrlLanguage("")).toBeNull();
  });

  it("falls back to the live URL when no search string is passed", () => {
    setSearch("?lang=en");
    expect(getUrlLanguage()).toBe("en");
  });
});

describe("getStoredLanguage", () => {
  it("is null when the visitor has never chosen", () => {
    expect(getStoredLanguage()).toBeNull();
  });

  it("returns the stored choice", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    expect(getStoredLanguage()).toBe("en");
  });

  it("treats an unrecognised stored value as no choice at all", () => {
    localStorage.setItem(STORAGE_KEY, "klingon");
    expect(getStoredLanguage()).toBeNull();
  });
});

describe("resolveInitialLanguage", () => {
  it("prefers ?lang= over a conflicting stored choice, so shared links work", () => {
    localStorage.setItem(STORAGE_KEY, "ru");
    setSearch("?lang=en");
    expect(resolveInitialLanguage()).toBe("en");
  });

  it("persists a ?lang= link, so the next in-app navigation does not revert", () => {
    setSearch("?lang=en");
    resolveInitialLanguage();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("honours a stored English choice", () => {
    setBrowserLanguages(["ru-RU"]);
    localStorage.setItem(STORAGE_KEY, "en");
    expect(resolveInitialLanguage()).toBe("en");
  });

  /**
   * The browser's preference is deliberately NOT a rung. If it were, one URL
   * would render different languages to different visitors, and its canonical
   * would depend on who was asking -- which cost the Russian landing its
   * indexable URL when Googlebot (en-US) rendered `/` as English.
   */
  it("ignores the browser preference and stays Russian for a first-time visitor", () => {
    setBrowserLanguages(["en-GB", "en-US"]);
    expect(resolveInitialLanguage()).toBe("ru");
  });

  it("stays Russian for a first-time visitor on a Russian browser", () => {
    setBrowserLanguages(["ru-RU"]);
    expect(resolveInitialLanguage()).toBe("ru");
  });

  it("survives localStorage throwing (Safari private mode) instead of crashing boot", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    setBrowserLanguages(["en-US"]);

    expect(() => resolveInitialLanguage()).not.toThrow();
    expect(resolveInitialLanguage()).toBe("ru");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
