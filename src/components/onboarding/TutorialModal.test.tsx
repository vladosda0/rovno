import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { markSeenMock } = vi.hoisted(() => ({ markSeenMock: vi.fn() }));

vi.mock("@/hooks/use-tutorial-state", () => ({
  useHasSeenTutorial: () => false,
  useMarkTutorialSeen: () => markSeenMock,
}));

import { TutorialModal } from "@/components/onboarding/TutorialModal";

const steps = [{ titleKey: "tutorial.aiSidebar.step3.title", descriptionKey: "tutorial.aiSidebar.step3.description" }];

async function openModal(onDone?: () => void) {
  render(<TutorialModal tutorialKey="ai_sidebar" steps={steps} openDelayMs={0} onDone={onDone} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
}

describe("TutorialModal close", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([/^(got it|понятно)$/i, /^(skip|пропустить)$/i])(
    "closes at once and records the tutorial while the server write is still pending (%s)",
    async (name) => {
      markSeenMock.mockReturnValue(new Promise(() => {}));
      const onDone = vi.fn();
      await openModal(onDone);

      fireEvent.click(screen.getByRole("button", { name }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(markSeenMock).toHaveBeenCalledWith("ai_sidebar");
      expect(onDone).toHaveBeenCalledTimes(1);
    },
  );
});
