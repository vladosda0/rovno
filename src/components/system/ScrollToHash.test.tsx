// Regression coverage for the cross-page anchor bug: clicking a landing-section
// link (e.g. "Тарифы" -> /#pricing) from anywhere must land on the section, not
// dump you at the top of a freshly-mounted page.
import { useEffect, useState } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ScrollToHash } from "./ScrollToHash";

// jsdom has no layout engine, so Element.prototype.scrollIntoView is a stub.
// Record calls (element + options) so we can assert both the target and the
// scroll style.
type ScrollCall = { id: string | undefined; opts: ScrollIntoViewOptions | undefined };
let scrollCalls: ScrollCall[];
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  scrollCalls = [];
  Element.prototype.scrollIntoView = function (opts?: boolean | ScrollIntoViewOptions) {
    scrollCalls.push({ id: (this as HTMLElement).id, opts: opts as ScrollIntoViewOptions });
  };
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

function GoTo({ label, to }: { label: string; to: { pathname: string; hash: string } }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>{label}</button>;
}

/** A route whose scroll target only appears after a tick — mimics a lazy page. */
function LazySection() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);
  return ready ? <div id="pricing">Pricing</div> : <div>loading…</div>;
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ScrollToHash />
      <GoTo label="to-pricing" to={{ pathname: "/", hash: "#pricing" }} />
      <GoTo label="to-lazy" to={{ pathname: "/lazy", hash: "#pricing" }} />
      <Routes>
        <Route path="/" element={<div id="pricing">Pricing section</div>} />
        <Route path="/blog" element={<div>Blog index</div>} />
        <Route path="/lazy" element={<LazySection />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ScrollToHash", () => {
  it("does not scroll on a plain load with no hash", async () => {
    renderApp("/");
    // Give any stray rAF a chance to fire.
    await new Promise((r) => setTimeout(r, 60));
    expect(scrollCalls).toHaveLength(0);
  });

  it("scrolls once, smoothly, when navigating within the same page", async () => {
    renderApp("/");
    fireEvent.click(screen.getByText("to-pricing"));
    // Same-page path is a single scroll (layout is already settled), not the
    // re-pin loop.
    await waitFor(() => expect(scrollCalls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 120));
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0].id).toBe("pricing");
    expect(scrollCalls[0].opts).toMatchObject({ behavior: "smooth", block: "start" });
  });

  it("scrolls to the section on a cross-page jump (instant), e.g. blog → /#pricing", async () => {
    renderApp("/blog");
    fireEvent.click(screen.getByText("to-pricing"));
    await waitFor(() => expect(scrollCalls.length).toBeGreaterThanOrEqual(1));
    // Cross-page re-pins with instant scrolls, always at the pricing target.
    expect(scrollCalls.every((c) => c.id === "pricing")).toBe(true);
    expect(scrollCalls[0].opts).toMatchObject({ behavior: "auto", block: "start" });
  });

  it("waits for a lazily-rendered target to mount, then scrolls to it", async () => {
    renderApp("/blog");
    expect(screen.queryByText("loading…")).toBeNull();
    fireEvent.click(screen.getByText("to-lazy"));
    // Target isn't in the DOM yet on the first frame — no scroll until it mounts.
    expect(scrollCalls).toHaveLength(0);
    await waitFor(() => expect(scrollCalls.length).toBeGreaterThanOrEqual(1), { timeout: 1500 });
    expect(scrollCalls.every((c) => c.id === "pricing")).toBe(true);
  });

  it("re-pins while the target's position is still shifting, then stops once it settles", async () => {
    // The crux of the cross-page fix: a lazy page inserts the target before the
    // sections above it lay out, so its absolute position moves for a few frames
    // (a one-shot scroll would land at the top). jsdom has no layout engine, so
    // drive the settle by feeding getBoundingClientRect a moving-then-steady
    // top; the loop must keep re-pinning until it holds steady, then stop.
    const tops = [1000, 600, 200, 200, 200];
    let readIdx = 0;
    const realRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if ((this as HTMLElement).id === "pricing") {
        const top = tops[Math.min(readIdx, tops.length - 1)];
        readIdx += 1;
        return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
      }
      return realRect.call(this);
    };
    try {
      renderApp("/blog");
      fireEvent.click(screen.getByText("to-pricing"));
      // Let the loop run to completion (polls at 50ms; the position moves for
      // three reads then holds).
      await new Promise((r) => setTimeout(r, 500));
      // It re-pinned several times while the position was still moving...
      expect(scrollCalls.length).toBeGreaterThanOrEqual(3);
      // ...then converged: once the position held steady, scrolling stopped.
      const settled = scrollCalls.length;
      await new Promise((r) => setTimeout(r, 250));
      expect(scrollCalls.length).toBe(settled);
      expect(scrollCalls.every((c) => c.id === "pricing")).toBe(true);
    } finally {
      Element.prototype.getBoundingClientRect = realRect;
    }
  });
});
