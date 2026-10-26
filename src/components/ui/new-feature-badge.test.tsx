import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NewFeatureBadge, NewFeatureDot } from "@/components/ui/new-feature-badge";
import { NEW_FEATURES_STORAGE_KEY, markFeatureOpened, resetNewFeaturesForTests } from "@/lib/new-features";

describe("NewFeatureBadge", () => {
  beforeEach(() => {
    localStorage.clear();
    resetNewFeaturesForTests();
  });

  it("shows the «New» pill for an unopened feature and starts the person's clock", () => {
    render(<NewFeatureBadge featureId="knowledge-base" />);
    // A span, so it stays valid inside the nav-row <button>.
    expect(screen.getByText("New").tagName).toBe("SPAN");
    const stored = JSON.parse(localStorage.getItem(NEW_FEATURES_STORAGE_KEY)!);
    expect(stored["knowledge-base"].firstSeenAt).toBeTruthy();
  });

  it("renders nothing for an id outside the registry", () => {
    const { container } = render(<NewFeatureBadge featureId="nope" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disappears in the same frame the feature is opened", () => {
    render(<NewFeatureBadge featureId="knowledge-base" />);
    act(() => markFeatureOpened("knowledge-base"));
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });
});

describe("NewFeatureDot", () => {
  beforeEach(() => {
    localStorage.clear();
    resetNewFeaturesForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts the clock only when the dot comes on screen, including after it was hidden", () => {
    let report: (visible: boolean) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          report = (visible) => callback([{ isIntersecting: visible }]);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    render(<NewFeatureDot featureIds={["knowledge-base"]} />);
    act(() => report(false));
    expect(localStorage.getItem(NEW_FEATURES_STORAGE_KEY)).toBeNull();
    act(() => report(true));
    const stored = JSON.parse(localStorage.getItem(NEW_FEATURES_STORAGE_KEY)!);
    expect(stored["knowledge-base"].firstSeenAt).toBeTruthy();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows a dot with a screen-reader label while any listed feature is unopened", () => {
    render(<NewFeatureDot featureIds={["knowledge-base"]} />);
    expect(screen.getByText("has something new")).toHaveClass("sr-only");
  });

  it("renders nothing when every listed feature is opened, or none is listed", () => {
    markFeatureOpened("knowledge-base");
    const { container } = render(<NewFeatureDot featureIds={["knowledge-base"]} />);
    expect(container).toBeEmptyDOMElement();
    const empty = render(<NewFeatureDot featureIds={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});
