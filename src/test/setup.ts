import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { __unsafeResetRuntimeAuthForTests } from "@/hooks/use-runtime-auth";

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
