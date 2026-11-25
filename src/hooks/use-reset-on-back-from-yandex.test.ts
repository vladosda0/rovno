import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResetOnBackFromYandex } from "./use-reset-on-back-from-yandex";

function pageShow(persisted: boolean) {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

describe("useResetOnBackFromYandex", () => {
  it("resets on a page restored from the back-forward cache and not on an ordinary load", () => {
    const reset = vi.fn();
    renderHook(() => useResetOnBackFromYandex(reset));
    pageShow(false);
    expect(reset).not.toHaveBeenCalled();
    pageShow(true);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
