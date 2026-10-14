// Turns a DOM node into an A4 PDF and saves it as a file, without the browser
// print dialog. The node is drawn to a canvas and placed on the pages as an
// image. Generic on purpose: the client report uses it first.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const DEFAULT_MARGIN_MM = 10;
const DEFAULT_SCALE = 2;
const DEFAULT_IMAGE_TIMEOUT_MS = 8000;
const DEFAULT_KEEP_SELECTOR = "[data-pdf-keep], img, li, p, h1, h2, h3, tr";
/** Upper bound for one canvas, in device pixels (width times height). */
export const MAX_CANVAS_AREA_PX = 16_000_000;
const FORBIDDEN_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;

export interface DownloadPdfOptions {
  /** File name; ".pdf" is added when missing. */
  fileName: string;
  /** Page margin in millimetres. */
  marginMm?: number;
  /** Canvas pixels per CSS pixel. */
  scale?: number;
  /** Lay the node out at this width for the file, whatever its width on screen. */
  renderWidthPx?: number;
  /** Elements a page break must not cut through. */
  keepTogetherSelector?: string;
  /** How long to wait for the node's images to load or fail before drawing. */
  imageTimeoutMs?: number;
}

/** A name the file system accepts, ending in ".pdf". */
export function toPdfFileName(name: string): string {
  const cleaned = name.replace(FORBIDDEN_FILE_NAME_CHARS, " ").replace(/\s+/g, " ").trim() || "document";
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

function waitForImages(node: HTMLElement, timeoutMs: number): Promise<void> {
  const pending = Array.from(node.querySelectorAll("img")).filter((image) => !image.complete);
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let left = pending.length;
    const timer = window.setTimeout(resolve, timeoutMs);
    const settle = () => {
      left -= 1;
      if (left > 0) return;
      window.clearTimeout(timer);
      resolve();
    };
    pending.forEach((image) => {
      image.addEventListener("load", settle, { once: true });
      image.addEventListener("error", settle, { once: true });
    });
  });
}

interface Span {
  top: number;
  bottom: number;
}

interface Layout {
  /** Size of the node in CSS pixels. */
  width: number;
  height: number;
  /** Keep-together elements, in CSS pixels from the node's top. */
  spans: Span[];
}

function measureLayout(node: HTMLElement, selector: string): Layout {
  const box = node.getBoundingClientRect();
  const spans = Array.from(node.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.closest("[data-pdf-exclude]"))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top - box.top, bottom: rect.bottom - box.top };
    })
    .filter((span) => span.bottom > span.top);
  return { width: box.width, height: box.height, spans };
}

/**
 * Canvas rows where each page ends. A break that would cut through a
 * keep-together element moves up to that element's top, unless the element is
 * taller than a page or starts the page, where cutting is the only option.
 */
export function planPageBreaks(totalHeight: number, pageHeight: number, spans: Span[]): number[] {
  const breaks: number[] = [];
  if (pageHeight <= 0) return [totalHeight];
  let start = 0;
  while (totalHeight - start > pageHeight) {
    let end = start + pageHeight;
    const cut = spans
      .filter((span) => span.top < end && span.bottom > end && span.top > start)
      .reduce((lowest, span) => Math.min(lowest, span.top), end);
    end = Math.floor(cut);
    if (end <= start) end = start + pageHeight;
    breaks.push(end);
    start = end;
  }
  breaks.push(totalHeight);
  return breaks;
}

function slice(source: HTMLCanvasElement, top: number, height: number): HTMLCanvasElement {
  const page = document.createElement("canvas");
  page.width = source.width;
  page.height = height;
  const context = page.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, page.width, page.height);
    context.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height);
  }
  return page;
}

/**
 * The scale to draw a node of this CSS size at: the requested one while the
 * canvas stays under `maxArea`, lowered otherwise, never below 1.
 */
export function chooseCanvasScale(
  widthCss: number,
  heightCss: number,
  requested: number,
  maxArea: number = MAX_CANVAS_AREA_PX,
): number {
  const wanted = Math.max(1, requested);
  const area = widthCss * heightCss;
  if (area <= 0 || area * wanted * wanted <= maxArea) return wanted;
  return Math.max(1, Math.floor(Math.sqrt(maxArea / area) * 100) / 100);
}

/**
 * Draw `node` and save it as an A4 PDF named `options.fileName`.
 *
 * Elements marked `data-pdf-exclude` are left out of the file. A node too
 * large for one canvas even at scale 1 is drawn in vertical slices, each
 * added to the file page by page. jspdf and html2canvas load on the first
 * call only.
 */
export async function downloadNodeAsPdf(node: HTMLElement, options: DownloadPdfOptions): Promise<void> {
  const marginMm = options.marginMm ?? DEFAULT_MARGIN_MM;
  const keepSelector = options.keepTogetherSelector ?? DEFAULT_KEEP_SELECTOR;
  const renderWidthPx = options.renderWidthPx;
  const contentWidthMm = A4_WIDTH_MM - marginMm * 2;
  const contentHeightMm = A4_HEIGHT_MM - marginMm * 2;

  await waitForImages(node, options.imageTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  // The scale has to be chosen before the copy exists, so the height at
  // `renderWidthPx` is an estimate: the node's height times the ratio of the
  // two widths.
  let layout = measureLayout(node, keepSelector);
  const widthCss = renderWidthPx ?? layout.width;
  const ratio = renderWidthPx && layout.width > 0 ? renderWidthPx / layout.width : 1;
  let totalHeightCss = layout.height * Math.max(ratio, 1 / ratio);
  const scale = chooseCanvasScale(widthCss, totalHeightCss, options.scale ?? DEFAULT_SCALE);
  const sliceHeightCss = widthCss * totalHeightCss * scale * scale > MAX_CANVAS_AREA_PX
    ? Math.floor(MAX_CANVAS_AREA_PX / (widthCss * scale * scale))
    : null;

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let offsetCss = 0;
  let pages = 0;
  do {
    const canvas = await html2canvas(node, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      ...(renderWidthPx ? { windowWidth: renderWidthPx } : {}),
      ...(sliceHeightCss !== null
        ? { y: offsetCss, height: Math.max(1, Math.min(sliceHeightCss, Math.ceil(totalHeightCss - offsetCss))) }
        : {}),
      ignoreElements: (element) => element.hasAttribute("data-pdf-exclude"),
      // Measured on the copy that is drawn, since `renderWidthPx` gives it a
      // layout of its own; the node itself is the fallback.
      onclone: (_document, clone) => {
        if (renderWidthPx) clone.style.width = `${renderWidthPx}px`;
        const measured = measureLayout(clone, keepSelector);
        if (measured.width > 0) layout = measured;
      },
    });
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("downloadNodeAsPdf: the node has no size");
    }
    if (sliceHeightCss !== null && layout.height > 0) totalHeightCss = layout.height;

    const pxPerMm = canvas.width / contentWidthMm;
    const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);
    const pxPerCssPx = layout.width > 0 ? canvas.width / layout.width : scale;
    const spans = layout.spans.map((span) => ({
      top: (span.top - offsetCss) * pxPerCssPx,
      bottom: (span.bottom - offsetCss) * pxPerCssPx,
    }));
    let breaks = planPageBreaks(canvas.height, pageHeightPx, spans);
    const lastSlice = sliceHeightCss === null || offsetCss + canvas.height / pxPerCssPx >= totalHeightCss - 0.5;
    // A slice ends wherever the canvas limit falls; its unfinished last page
    // is left for the next slice, which starts at this slice's last break.
    if (!lastSlice && breaks.length > 1) breaks = breaks.slice(0, -1);

    let top = 0;
    for (const bottom of breaks) {
      const height = bottom - top;
      const page = height === canvas.height ? canvas : slice(canvas, top, height);
      if (pages > 0) pdf.addPage();
      pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", marginMm, marginMm, contentWidthMm, height / pxPerMm);
      pages += 1;
      top = bottom;
    }
    offsetCss += top / pxPerCssPx;
  } while (sliceHeightCss !== null && offsetCss < totalHeightCss - 0.5);

  pdf.save(toPdfFileName(options.fileName));
}
