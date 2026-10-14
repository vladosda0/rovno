import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { html2canvasMock, addImage, addPage, save, jsPDFMock } = vi.hoisted(() => {
  const addImage = vi.fn();
  const addPage = vi.fn();
  const save = vi.fn();
  return {
    html2canvasMock: vi.fn(),
    addImage,
    addPage,
    save,
    jsPDFMock: vi.fn(() => ({ addImage, addPage, save })),
  };
});

vi.mock("html2canvas", () => ({ default: html2canvasMock }));
vi.mock("jspdf", () => ({ jsPDF: jsPDFMock }));

import { chooseCanvasScale, downloadNodeAsPdf, planPageBreaks, toPdfFileName } from "@/lib/download-pdf";

function fakeCanvas(width: number, height: number) {
  return { width, height, toDataURL: vi.fn(() => "data:image/jpeg;base64,AAAA") };
}

describe("downloadNodeAsPdf", () => {
  let printSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    html2canvasMock.mockReset();
    jsPDFMock.mockClear();
    addImage.mockReset();
    addPage.mockReset();
    save.mockReset();
    printSpy = vi.fn();
    vi.stubGlobal("print", printSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saves the node as an A4 file under the given name, without the print dialog", async () => {
    const node = document.createElement("div");
    // 1900 px across 190 mm of content: 10 px per mm, so 500 px is 50 mm tall.
    html2canvasMock.mockResolvedValue(fakeCanvas(1900, 500));

    await downloadNodeAsPdf(node, { fileName: "Ленина 42 · отчёт 9–13 октября" });

    expect(html2canvasMock).toHaveBeenCalledWith(node, expect.objectContaining({ useCORS: true }));
    expect(jsPDFMock).toHaveBeenCalledWith({ unit: "mm", format: "a4", orientation: "portrait" });
    expect(addImage).toHaveBeenCalledTimes(1);
    expect(addImage).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA", "JPEG", 10, 10, 190, 50);
    expect(addPage).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith("Ленина 42 · отчёт 9–13 октября.pdf");
    expect(printSpy).not.toHaveBeenCalled();
  });

  it("leaves out what is marked as not for the file", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(1900, 500));
    await downloadNodeAsPdf(document.createElement("div"), { fileName: "report" });

    const { ignoreElements } = html2canvasMock.mock.calls[0][1] as { ignoreElements: (el: Element) => boolean };
    const button = document.createElement("button");
    expect(ignoreElements(button)).toBe(false);
    button.setAttribute("data-pdf-exclude", "");
    expect(ignoreElements(button)).toBe(true);
  });

  it("lays the drawn copy out at the requested width", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(1900, 500));
    await downloadNodeAsPdf(document.createElement("div"), { fileName: "report", renderWidthPx: 794 });

    const options = html2canvasMock.mock.calls[0][1] as {
      windowWidth?: number;
      onclone: (doc: Document, clone: HTMLElement) => void;
    };
    expect(options.windowWidth).toBe(794);
    const clone = document.createElement("div");
    options.onclone(document, clone);
    expect(clone.style.width).toBe("794px");
  });

  it("moves a page break above an element it would cut, as measured on the drawn copy", async () => {
    // The copy is 950 CSS px wide and the canvas 1900: two canvas px per CSS px,
    // and 2770 canvas px a page. A photo spanning 1300-1500 CSS px (2600-3000 on
    // the canvas) straddles the first break, which moves up to its top.
    html2canvasMock.mockImplementation(async (_node: HTMLElement, options: { onclone: (doc: Document, clone: HTMLElement) => void }) => {
      const clone = document.createElement("div");
      const photo = document.createElement("img");
      clone.appendChild(photo);
      const rect = (top: number, bottom: number, width: number) =>
        ({ top, bottom, width, left: 0, right: width, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      clone.getBoundingClientRect = () => rect(0, 2000, 950);
      photo.getBoundingClientRect = () => rect(1300, 1500, 300);
      options.onclone(document, clone);
      return fakeCanvas(1900, 4000);
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,PAGE");

    await downloadNodeAsPdf(document.createElement("div"), { fileName: "report" });

    expect(drawImage.mock.calls.map((call) => [call[2], call[4]])).toEqual([
      [0, 2600],
      [2600, 1400],
    ]);
  });

  it("spreads tall content over several pages", async () => {
    // 277 mm of content per page at 10 px per mm: 2770 px a page, so 6000 px is three pages.
    html2canvasMock.mockResolvedValue(fakeCanvas(1900, 6000));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,PAGE");

    await downloadNodeAsPdf(document.createElement("div"), { fileName: "long.pdf" });

    expect(addImage).toHaveBeenCalledTimes(3);
    expect(addPage).toHaveBeenCalledTimes(2);
    expect(drawImage.mock.calls.map((call) => [call[2], call[4]])).toEqual([
      [0, 2770],
      [2770, 2770],
      [5540, 460],
    ]);
    expect(addImage.mock.calls[2]).toEqual(["data:image/jpeg;base64,PAGE", "JPEG", 10, 10, 190, 46]);
    expect(save).toHaveBeenCalledWith("long.pdf");
  });

  it("still produces the file when an image never loads", async () => {
    vi.useFakeTimers();
    try {
      const node = document.createElement("div");
      const image = document.createElement("img");
      Object.defineProperty(image, "complete", { value: false });
      node.appendChild(image);
      html2canvasMock.mockResolvedValue(fakeCanvas(1900, 500));

      const done = downloadNodeAsPdf(node, { fileName: "report", imageTimeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      await done;

      expect(save).toHaveBeenCalledWith("report.pdf");
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a node that has no size instead of saving an empty file", async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(0, 0));

    await expect(downloadNodeAsPdf(document.createElement("div"), { fileName: "report" })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("chooseCanvasScale", () => {
  it("keeps the requested scale while the canvas fits", () => {
    expect(chooseCanvasScale(794, 2000, 2)).toBe(2);
    expect(chooseCanvasScale(0, 0, 2)).toBe(2);
  });

  it("lowers the scale so that the canvas stays under the cap", () => {
    // 794 x 8000 CSS px at scale 2 is 25.4 million px; 1.58 brings it under 16 million.
    const scale = chooseCanvasScale(794, 8000, 2);
    expect(scale).toBe(1.58);
    expect(794 * 8000 * scale * scale).toBeLessThanOrEqual(16_000_000);
  });

  it("never goes below 1, even when 1 is still over the cap", () => {
    expect(chooseCanvasScale(794, 40_000, 2)).toBe(1);
    expect(chooseCanvasScale(794, 100, 0.5)).toBe(1);
  });
});

describe("downloadNodeAsPdf on a very tall node", () => {
  const rect = (width: number, height: number) =>
    ({ top: 0, bottom: height, width, height, left: 0, right: width, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  beforeEach(() => {
    html2canvasMock.mockReset();
    addImage.mockReset();
    addPage.mockReset();
    save.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,PAGE");
  });

  afterEach(() => vi.restoreAllMocks());

  it("draws at a lower scale when the requested one would exceed the canvas cap", async () => {
    const node = document.createElement("div");
    node.getBoundingClientRect = () => rect(1000, 8000);
    html2canvasMock.mockImplementation(async (_node: HTMLElement, options: { scale: number }) =>
      fakeCanvas(1000 * options.scale, 8000 * options.scale));

    await downloadNodeAsPdf(node, { fileName: "tall" });

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    const { scale, y } = html2canvasMock.mock.calls[0][1] as { scale: number; y?: number };
    expect(scale).toBe(1.41);
    expect(y).toBeUndefined();
  });

  it("draws in slices when even scale 1 is over the cap, and loses no page between them", async () => {
    // 1000 x 40000 CSS px is 40 million px at scale 1: slices of 16000 px.
    // 1000 px across 190 mm gives 1457 px a page, so 28 pages in all.
    const node = document.createElement("div");
    node.getBoundingClientRect = () => rect(1000, 40_000);
    html2canvasMock.mockImplementation(
      async (_node: HTMLElement, options: { scale: number; height: number; onclone: (d: Document, c: HTMLElement) => void }) => {
        const clone = document.createElement("div");
        clone.getBoundingClientRect = () => rect(1000, 40_000);
        options.onclone(document, clone);
        return fakeCanvas(1000 * options.scale, options.height * options.scale);
      },
    );

    await downloadNodeAsPdf(node, { fileName: "huge" });

    const calls = html2canvasMock.mock.calls.map(
      ([, options]) => options as { scale: number; y: number; height: number },
    );
    expect(calls.map((call) => call.scale)).toEqual([1, 1, 1]);
    expect(calls.map((call) => [call.y, call.height])).toEqual([
      [0, 16_000],
      [14_570, 16_000],
      [29_140, 10_860],
    ]);
    calls.forEach((call) => expect(1000 * call.height).toBeLessThanOrEqual(16_000_000));
    expect(addImage).toHaveBeenCalledTimes(28);
    expect(addPage).toHaveBeenCalledTimes(27);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("planPageBreaks", () => {
  it("keeps short content on one page", () => {
    expect(planPageBreaks(500, 1000, [])).toEqual([500]);
  });

  it("moves a break above an element it would cut through", () => {
    expect(planPageBreaks(2500, 1000, [{ top: 950, bottom: 1100 }])).toEqual([950, 1950, 2500]);
  });

  it("cuts through an element taller than a page rather than looping", () => {
    expect(planPageBreaks(2500, 1000, [{ top: 0, bottom: 2400 }])).toEqual([1000, 2000, 2500]);
  });
});

describe("toPdfFileName", () => {
  it("adds the extension once and drops what a file system refuses", () => {
    expect(toPdfFileName("Ленина 42 · отчёт 9–13 октября")).toBe("Ленина 42 · отчёт 9–13 октября.pdf");
    expect(toPdfFileName("a/b: c?.pdf")).toBe("a b c .pdf");
    expect(toPdfFileName("  ")).toBe("document.pdf");
  });
});
