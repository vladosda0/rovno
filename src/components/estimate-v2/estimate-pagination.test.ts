import { describe, expect, it } from "vitest";
import {
  type BlockMeasure,
  getPageGeometry,
  mmToPx,
  paginateBlocks,
} from "./estimate-pagination";

function block(id: string, height: number, extra: Partial<BlockMeasure> = {}): BlockMeasure {
  return { id, height, gapBefore: 0, ...extra };
}

describe("getPageGeometry", () => {
  it("derives A4 portrait content box from page minus margins", () => {
    const g = getPageGeometry("portrait");
    expect(g.pageWidthMm).toBe(210);
    expect(g.pageHeightMm).toBe(297);
    expect(g.contentWidthMm).toBe(210 - 28);
    expect(g.contentHeightMm).toBe(297 - 32);
    expect(g.contentHeightPx).toBeCloseTo(mmToPx(265), 5);
  });

  it("swaps dimensions and uses a smaller vertical margin in landscape", () => {
    const g = getPageGeometry("landscape");
    expect(g.pageWidthMm).toBe(297);
    expect(g.pageHeightMm).toBe(210);
    expect(g.marginYMm).toBe(12);
    expect(g.contentHeightMm).toBe(210 - 24);
  });
});

describe("paginateBlocks", () => {
  it("keeps everything on one page when it fits", () => {
    const pages = paginateBlocks(
      [block("a", 100), block("b", 100), block("c", 100)],
      { pageContentHeightPx: 1000 },
    );
    expect(pages).toEqual([["a", "b", "c"]]);
  });

  it("breaks onto a new page when the running height overflows", () => {
    const pages = paginateBlocks(
      [block("a", 400), block("b", 400), block("c", 400)],
      { pageContentHeightPx: 1000, safetyPx: 0 },
    );
    expect(pages).toEqual([["a", "b"], ["c"]]);
  });

  it("counts gapBefore only for non-first blocks on a page", () => {
    // a:400, b:400 (+gap 100 -> 900), c:400 would be 900+? -> overflow when gap counted
    const pages = paginateBlocks(
      [
        block("a", 400),
        block("b", 400, { gapBefore: 100 }),
        block("c", 200, { gapBefore: 100 }),
      ],
      { pageContentHeightPx: 1000, safetyPx: 0 },
    );
    // a(400)+gap(100)+b(400)=900; +gap(100)+c(200)=1200 > 1000 -> c to page 2 (no leading gap)
    expect(pages).toEqual([["a", "b"], ["c"]]);
  });

  it("places an oversized block on its own page without splitting it", () => {
    const pages = paginateBlocks(
      [block("a", 300), block("huge", 5000), block("b", 300)],
      { pageContentHeightPx: 1000, safetyPx: 0 },
    );
    expect(pages).toEqual([["a"], ["huge"], ["b"]]);
  });

  it("pulls a keepWithNext header to the next page instead of stranding it", () => {
    // page fills to 900 with a+b; a stage header (120) would fit alone (1020? no)
    // header(120) fits after 900 -> 1020 > 1000 already overflows, so it breaks anyway.
    // Use a case where the header itself fits but header+next does not.
    const pages = paginateBlocks(
      [
        block("a", 850),
        block("header", 100, { keepWithNext: true }),
        block("work", 300, { gapBefore: 0 }),
      ],
      { pageContentHeightPx: 1000, safetyPx: 0 },
    );
    // a=850; header alone would be 950 (fits) but header+work=1250 > 1000,
    // so keepWithNext moves header to page 2 to sit with work.
    expect(pages).toEqual([["a"], ["header", "work"]]);
  });

  it("does not strand a keepWithNext header that starts a fresh page", () => {
    const pages = paginateBlocks(
      [
        block("a", 950),
        block("header", 100, { keepWithNext: true }),
        block("work", 980),
      ],
      { pageContentHeightPx: 1000, safetyPx: 0 },
    );
    // a -> page1. header breaks to page2 (fresh), work can't fit with it but
    // header is already first on its page, so it stays; work overflows to page3.
    expect(pages).toEqual([["a"], ["header"], ["work"]]);
  });

  it("returns a single empty page for no blocks", () => {
    expect(paginateBlocks([], { pageContentHeightPx: 1000 })).toEqual([[]]);
  });
});
