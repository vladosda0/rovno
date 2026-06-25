// Must be first: installs a Web Storage polyfill before any app module reads
// localStorage (e.g. @/i18n), so tests run under a Node whose experimental
// global localStorage is unavailable (see ./polyfills).
import "./polyfills";
import "@testing-library/jest-dom";
import "@/i18n";
import { afterEach } from "vitest";
import i18n from "@/i18n";
import { __unsafeResetRuntimeAuthForTests } from "@/hooks/use-runtime-auth";

// Tests use English for readability.
void i18n.changeLanguage("en");

// jsdom lacks ResizeObserver, which some Radix primitives (e.g. Checkbox) use.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverMock as unknown as typeof ResizeObserver);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

afterEach(() => {
  __unsafeResetRuntimeAuthForTests();
});
