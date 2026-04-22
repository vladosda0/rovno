import "@testing-library/jest-dom";
import "@/i18n";
import { afterEach } from "vitest";
import i18n from "@/i18n";
import { __unsafeResetRuntimeAuthForTests } from "@/hooks/use-runtime-auth";

// Tests use English for readability.
void i18n.changeLanguage("en");

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
