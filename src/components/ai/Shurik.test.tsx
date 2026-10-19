import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shurik, SHURIK_IDLE_WINK_PAUSE_MS, SHURIK_WINK_MS, type ShurikPose } from "@/components/ai/Shurik";

const POSE_FILES: Record<ShurikPose, string> = {
  default: "/shurik/avatar.png",
  thinking: "/shurik/idea.png",
  done: "/shurik/wink-ok.png",
  notice: "/shurik/pointing.png",
  money: "/shurik/salute.png",
};

/** Returns a switch that flips the preference and tells the mounted listeners. */
function stubReducedMotion(initial: boolean) {
  let reduced = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return reduced && query.includes("prefers-reduced-motion");
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => false,
  }));
  return (next: boolean) => {
    reduced = next;
    listeners.forEach((listener) => listener());
  };
}

function pictureHash(src: string) {
  return createHash("sha256").update(readFileSync(resolve(process.cwd(), "public", `.${src}`))).digest("hex");
}

function renderedSrc(pose: ShurikPose) {
  const { unmount } = render(<Shurik pose={pose} />);
  const src = figure().getAttribute("src")!;
  unmount();
  return src;
}

/** Records every picture the component asks the browser to fetch ahead of showing it. */
function stubImagePreload() {
  const requested: string[] = [];
  vi.stubGlobal(
    "Image",
    class {
      set src(value: string) {
        requested.push(value);
      }
    },
  );
  return requested;
}

function figure() {
  return screen.getByRole("img", { name: "Shurik" }) as HTMLImageElement;
}

describe("Shurik", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(Object.entries(POSE_FILES))("shows its own picture for the %s pose", (pose, file) => {
    render(<Shurik pose={pose as ShurikPose} />);
    expect(figure().getAttribute("src")).toBe(file);
  });

  it("renders pictures that exist, and a different one for each pose but money", () => {
    const hashes = (["default", "thinking", "done", "notice"] as const).map((pose) => pictureHash(renderedSrc(pose)));
    expect(new Set(hashes).size).toBe(4);
    // Money stands at attention like the default: the same picture, kept as its own pose.
    expect(pictureHash(renderedSrc("money"))).toBe(hashes[0]);
  });

  it("is the whole figure in a 64 px box by default, with no circle around it", () => {
    render(<Shurik />);
    const img = figure();
    expect(img.getAttribute("src")).toBe(POSE_FILES.default);
    expect(img.getAttribute("height")).toBe("64");
    expect(img.getAttribute("width")).toBe("64");
    expect(img.parentElement!.style.width).toBe("64px");
    expect(img.parentElement!.style.height).toBe("64px");
    expect(img).toHaveClass("object-contain");
    expect(img.className).not.toMatch(/rounded|overflow-hidden|object-cover/);
    expect(img.parentElement!.className).not.toMatch(/rounded|overflow-hidden/);
  });

  it("takes another size when asked", () => {
    render(<Shurik size={40} />);
    expect(figure().getAttribute("height")).toBe("40");
    expect(figure().parentElement!.style.width).toBe("40px");
  });

  it("keeps the same box while the picture changes", () => {
    render(<Shurik pose="notice" motion="wink" />);
    const box = figure().parentElement!;
    expect(figure().getAttribute("src")).toBe(POSE_FILES.done);
    expect(box.style.width).toBe("64px");
    act(() => {
      vi.advanceTimersByTime(SHURIK_WINK_MS);
    });
    expect(figure().getAttribute("src")).toBe(POSE_FILES.notice);
    expect(box.style.width).toBe("64px");
  });

  it("can be decorative when the name is written next to it", () => {
    const { container } = render(<Shurik decorative />);
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("");
    expect(screen.queryByRole("img", { name: "Shurik" })).toBeNull();
  });

  it("stands still unless told to move", () => {
    render(<Shurik />);
    act(() => {
      vi.advanceTimersByTime(SHURIK_IDLE_WINK_PAUSE_MS * 3);
    });
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
    expect(figure().parentElement!.className).not.toMatch(/animate-/);
  });

  it("winks once and goes back to the pose it had", () => {
    render(<Shurik motion="wink" />);
    expect(figure().getAttribute("src")).toBe(POSE_FILES.done);
    expect(figure()).toHaveClass("animate-shurik-pop");

    act(() => {
      vi.advanceTimersByTime(SHURIK_WINK_MS);
    });
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
    expect(figure().className).not.toMatch(/animate-/);

    act(() => {
      vi.advanceTimersByTime(SHURIK_IDLE_WINK_PAUSE_MS * 3);
    });
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
  });

  it("fetches the new pose ahead when a moving figure is given another pose", () => {
    const requested = stubImagePreload();

    const { rerender } = render(<Shurik pose="default" motion="idle" />);
    requested.length = 0;
    rerender(<Shurik pose="notice" motion="idle" />);

    expect(requested).toContain(POSE_FILES.notice);
  });

  it("fetches the wink and the pose ahead when it moves, and nothing when it stands still", () => {
    const requested = stubImagePreload();

    render(<Shurik pose="notice" />).unmount();
    expect(requested).toEqual([]);

    render(<Shurik pose="notice" motion="wink" />).unmount();
    expect(requested).toEqual([POSE_FILES.done, POSE_FILES.notice]);

    requested.length = 0;
    render(<Shurik pose="done" motion="idle" />).unmount();
    expect(requested).toEqual([POSE_FILES.done]);

    requested.length = 0;
    stubReducedMotion(true);
    render(<Shurik pose="notice" motion="idle" />).unmount();
    expect(requested).toEqual([]);
  });

  it("sways and winks again and again while idle", () => {
    render(<Shurik motion="idle" />);
    expect(figure().parentElement).toHaveClass("animate-shurik-sway");
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);

    for (let round = 0; round < 2; round += 1) {
      act(() => {
        vi.advanceTimersByTime(SHURIK_IDLE_WINK_PAUSE_MS);
      });
      expect(figure().getAttribute("src")).toBe(POSE_FILES.done);
      act(() => {
        vi.advanceTimersByTime(SHURIK_WINK_MS);
      });
      expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
    }
  });

  it("does not move at all under reduced motion", () => {
    stubReducedMotion(true);

    const { unmount } = render(<Shurik motion="idle" />);
    act(() => {
      vi.advanceTimersByTime(SHURIK_IDLE_WINK_PAUSE_MS + 1);
    });
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
    expect(figure().parentElement!.className).not.toMatch(/animate-/);
    unmount();

    render(<Shurik motion="wink" />);
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
  });

  it("stops in the middle of a wink when reduced motion is switched on", () => {
    const setReduced = stubReducedMotion(false);
    render(<Shurik motion="idle" />);
    act(() => {
      vi.advanceTimersByTime(SHURIK_IDLE_WINK_PAUSE_MS);
    });
    expect(figure().getAttribute("src")).toBe(POSE_FILES.done);

    act(() => setReduced(true));
    expect(figure().getAttribute("src")).toBe(POSE_FILES.default);
    expect(figure().className).not.toMatch(/animate-/);
    expect(figure().parentElement!.className).not.toMatch(/animate-/);
  });
});
