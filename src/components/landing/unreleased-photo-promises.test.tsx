import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";

// AI photo analysis is promised outside the price list too, but the feature
// does not exist yet (rovno-db#45, Vlad 2026-09-29): every such promise is
// tagged "Coming soon" or reworded into the future tense.

vi.mock("@/hooks/use-tutorial-state", () => ({
  useHasSeenTutorial: () => false,
  useMarkTutorialSeen: () => async () => {},
}));

import { KeyFeatures } from "@/components/landing/LandingKeyFeatures";
import { TutorialModal } from "@/components/onboarding/TutorialModal";

const SOON = "Coming soon";

describe("unreleased AI photo analysis outside the price list", () => {
  it("landing key features: the Photo card carries a 'Coming soon' badge, other cards do not", () => {
    render(
      <MemoryRouter>
        <KeyFeatures />
      </MemoryRouter>,
    );
    const photoPills = screen.getAllByText("Photos", { selector: "[data-kf-pill] *, [data-kf-pill]" });
    expect(photoPills.length).toBeGreaterThan(0);
    for (const pill of photoPills) {
      const head = pill.closest("[data-kf-head]") as HTMLElement;
      expect(head).not.toBeNull();
      expect(within(head).getByText(SOON)).toBeInTheDocument();
    }
    const chatHead = screen.getAllByText("AI chat", { selector: "[data-kf-pill] *, [data-kf-pill]" })[0].closest("[data-kf-head]") as HTMLElement;
    expect(within(chatHead).queryByText(SOON)).toBeNull();
  });

  it("tutorial step marked soon shows the badge next to its title", async () => {
    vi.useFakeTimers();
    render(
      <TutorialModal
        tutorialKey="ai_sidebar"
        steps={[{ titleKey: "tutorial.aiSidebar.step3.title", descriptionKey: "tutorial.aiSidebar.step3.description", soon: true }]}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    vi.useRealTimers();
    const title = screen.getByText("Photo consultation");
    const head = title.closest("[data-tutorial-head]") as HTMLElement;
    expect(within(head).getByText(SOON)).toBeInTheDocument();
  });

  it("gallery tutorial speaks about AI photo analysis in the future tense", () => {
    expect(ru["tutorial.media.step1.description"]).toContain("AI-анализ фото скоро");
    expect(ru["tutorial.media.step1.aiHint"]).toMatch(/^Скоро:/);
    expect(en["tutorial.media.step1.description"]).toContain("AI photo analysis is coming soon");
    expect(en["tutorial.media.step1.aiHint"]).toMatch(/^Coming soon:/);
  });
});
