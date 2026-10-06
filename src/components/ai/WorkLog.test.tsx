import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkLog } from "@/components/ai/WorkLog";

const STEPS = ["Checking access", "Reading the project", "Preparing the answer"];
const SPEED_MS = 600;

function figureSrc(container: HTMLElement) {
  return container.querySelector("img")?.getAttribute("src");
}

describe("WorkLog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Shurik thinking while the steps run", () => {
    const { container } = render(<WorkLog steps={STEPS} speed={SPEED_MS} />);

    expect(screen.getByText("Shurik is thinking…")).toBeInTheDocument();
    expect(figureSrc(container)).toBe("/shurik/idea.png");
    for (const step of STEPS) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it("switches to the done pose once every step is complete", () => {
    const { container } = render(<WorkLog steps={STEPS} speed={SPEED_MS} />);

    for (let i = 0; i < STEPS.length; i += 1) {
      act(() => {
        vi.advanceTimersByTime(SPEED_MS);
      });
    }

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("Shurik is thinking…")).not.toBeInTheDocument();
    expect(figureSrc(container)).toBe("/shurik/wink-ok.png");
  });

  it("keeps thinking on the last step while real work is still running", () => {
    const { container } = render(<WorkLog steps={STEPS} speed={SPEED_MS} holdFinalStep />);

    for (let i = 0; i < STEPS.length + 2; i += 1) {
      act(() => {
        vi.advanceTimersByTime(SPEED_MS);
      });
    }

    expect(screen.getByText("Shurik is thinking…")).toBeInTheDocument();
    expect(figureSrc(container)).toBe("/shurik/idea.png");
  });

  it("does not read the name out twice next to the heading", () => {
    const { container } = render(<WorkLog steps={STEPS} speed={SPEED_MS} />);

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});
