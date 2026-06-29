import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

function renderStepper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingStepper onComplete={() => {}} />
    </QueryClientProvider>,
  );
}

describe("OnboardingStepper units persistence", () => {
  // Radix Select needs these jsdom polyfills (same pattern as ProjectEstimate.test.tsx).
  beforeEach(() => {
    class MockPointerEvent extends MouseEvent {
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, params: MouseEventInit & { pointerType?: string; isPrimary?: boolean } = {}) {
        super(type, params);
        this.pointerType = params.pointerType ?? "mouse";
        this.isPrimary = params.isPrimary ?? true;
      }
    }
    Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: MockPointerEvent });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: () => {} });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, writable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, writable: true, value: () => {} });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, writable: true, value: () => {} });
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("persists the chosen units to local profile preferences on Continue", async () => {
    // The Preferences step is the initial render (MVP_SHOW_AI_AUTOMATION_MODE_UI is false).
    renderStepper();
    // Two Selects on this step: language, then units (last).
    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.pointerDown(comboboxes[comboboxes.length - 1]);
    const imperialOption = await screen.findByRole("option", { name: /imperial/i });
    fireEvent.click(imperialOption);

    fireEvent.click(screen.getByRole("button", { name: /continue|продолжить/i }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("profile-preferences") ?? "{}") as Record<string, unknown>;
      expect(saved.units).toBe("imperial");
    });
  });
});
