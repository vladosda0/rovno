/**
 * Pure pagination helpers for the estimate export document.
 *
 * The export preview used to render every stage/work as one tall, continuously
 * scrolling column ("Egyptian scroll"). To match how the same estimate looks in
 * Excel — discrete A4 sheets with clearly separated pages — we measure each
 * logical block (header, requisites, stage headers, whole works, subtotals,
 * totals, signatures) and greedily pack them onto fixed-height A4 pages.
 *
 * Everything here is framework-agnostic and side-effect free so the packing
 * logic can be unit tested without a DOM.
 */

export type PageOrientation = "portrait" | "landscape";

/** CSS reference pixels per millimetre at the canonical 96 dpi. */
export const PX_PER_MM = 96 / 25.4;

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

export interface PageGeometry {
  pageWidthMm: number;
  pageHeightMm: number;
  marginXMm: number;
  marginYMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  contentWidthPx: number;
  contentHeightPx: number;
}

/**
 * A4 geometry with the same margins the printed document uses. Landscape gets a
 * slightly smaller vertical margin, matching the previous page padding.
 */
export function getPageGeometry(orientation: PageOrientation): PageGeometry {
  const isLandscape = orientation === "landscape";
  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;
  const marginXMm = 14;
  const marginYMm = isLandscape ? 12 : 16;
  const contentWidthMm = pageWidthMm - marginXMm * 2;
  const contentHeightMm = pageHeightMm - marginYMm * 2;
  return {
    pageWidthMm,
    pageHeightMm,
    marginXMm,
    marginYMm,
    contentWidthMm,
    contentHeightMm,
    contentWidthPx: mmToPx(contentWidthMm),
    contentHeightPx: mmToPx(contentHeightMm),
  };
}

export interface BlockMeasure {
  id: string;
  /** Content-box height in px (no external margin). */
  height: number;
  /** Vertical space inserted above this block when it is NOT first on a page. */
  gapBefore: number;
  /**
   * When true, the block tries to stay on the same page as the block that
   * follows it (e.g. a stage header should not be stranded at the bottom of a
   * page away from its first work).
   */
  keepWithNext?: boolean;
}

export interface PaginateOptions {
  pageContentHeightPx: number;
  /** Slack subtracted from the page height to absorb sub-pixel rounding. */
  safetyPx?: number;
}

/**
 * Greedily pack blocks onto pages. Returns an array of pages, each an ordered
 * list of block ids. A block taller than a whole page is placed on its own page
 * and allowed to overflow (never dropped, never split) — callers render sheets
 * with `min-height`, so an oversized block just makes that one sheet taller.
 */
export function paginateBlocks(blocks: BlockMeasure[], opts: PaginateOptions): string[][] {
  const limit = Math.max(1, opts.pageContentHeightPx - (opts.safetyPx ?? 1));
  const pages: string[][] = [];
  let current: string[] = [];
  let used = 0;

  const flush = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }
  };

  const costOf = (b: BlockMeasure) => (current.length === 0 ? b.height : b.gapBefore + b.height);

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    // Break before this block if placing it would overflow a non-empty page.
    if (current.length > 0 && used + costOf(b) > limit) {
      flush();
    }

    // Keep-with-next: avoid stranding a header at the bottom of a page when the
    // following block cannot also fit. Only relevant on an already-filled page.
    if (b.keepWithNext && current.length > 0) {
      const next = blocks[i + 1];
      if (next) {
        const nextCost = next.gapBefore + next.height;
        if (used + costOf(b) + nextCost > limit) {
          flush();
        }
      }
    }

    used += costOf(b);
    current.push(b.id);
  }

  flush();
  if (pages.length === 0) pages.push([]);
  return pages;
}
