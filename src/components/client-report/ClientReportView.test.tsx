import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  ClientReportView,
  type ClientReportViewData,
} from "@/components/client-report/ClientReportView";
import { countCanvasReadablePhotos } from "@/components/client-report/report-photos";

function data(url: string): ClientReportViewData {
  return {
    projectTitle: "Lenina 42",
    preparedBy: "Ivan",
    periodStart: new Date(2026, 9, 9, 12).toISOString(),
    periodEnd: new Date(2026, 9, 13, 12).toISOString(),
    publishedAt: null,
    note: null,
    done: [],
    photos: [{ id: "media-1", caption: "Kitchen", url }],
    inProgress: [],
    next: [],
    progress: null,
    stages: null,
  };
}

/** jsdom never loads an image; these stand in for "the photo has loaded". */
function stubLoadedImages(width: number) {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(width);
}

describe("ClientReportView photos", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not count a photo that has not loaded as readable", () => {
    stubLoadedImages(0);
    const view = render(<ClientReportView data={data("https://signed.example/slow")} />);

    expect(screen.getByRole("img", { name: "Kitchen" })).toBeInTheDocument();
    expect(countCanvasReadablePhotos(view.container)).toBe(0);
  });

  it("does not count a photo that is still loading, whatever width it reports", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(800);
    const view = render(<ClientReportView data={data("https://signed.example/slow")} />);

    expect(countCanvasReadablePhotos(view.container)).toBe(0);
  });

  it("gives a photo a fresh start when its URL changes", () => {
    stubLoadedImages(800);
    const view = render(<ClientReportView data={data("https://signed.example/old")} />);
    expect(countCanvasReadablePhotos(view.container)).toBe(1);

    // CORS request refused, then the plain one fails too: the photo is gone.
    fireEvent.error(screen.getByRole("img", { name: "Kitchen" }));
    expect(countCanvasReadablePhotos(view.container)).toBe(0);
    fireEvent.error(screen.getByRole("img", { name: "Kitchen" }));
    expect(screen.queryByRole("img", { name: "Kitchen" })).toBeNull();

    view.rerender(<ClientReportView data={data("https://signed.example/new")} />);

    const photo = screen.getByRole("img", { name: "Kitchen" });
    expect(photo).toHaveAttribute("src", "https://signed.example/new");
    expect(photo).toHaveAttribute("crossorigin", "anonymous");
    expect(countCanvasReadablePhotos(view.container)).toBe(1);
  });
});

describe("ClientReportView header", () => {
  it("shows the Rovno logo instead of the word «ровно»", () => {
    const view = render(<ClientReportView data={data("https://signed.example/photo")} />);

    const logo = view.container.querySelector<HTMLImageElement>('img[src="/logo.svg"]');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute("alt")).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/^ровно|^rovno/);
    expect(screen.queryByText("clientReport.view.brand")).toBeNull();
  });

  it("marks a blocked task and shows its reason only when the row carries one", () => {
    const view = render(
      <ClientReportView
        data={{
          ...data("https://signed.example/x"),
          photos: [],
          inProgress: [
            { id: "t1", title: "Tiling", blocked: false },
            { id: "t2", title: "Bathtub", blocked: true, block_reason: "Waiting for the supplier" },
            { id: "t3", title: "Ceiling", blocked: true },
          ],
        }}
      />,
    );

    const block = screen.getByRole("region", { name: "In progress" });
    expect(within(block).getAllByText("Blocked")).toHaveLength(2);
    expect(within(block).getByText("Reason: Waiting for the supplier")).toBeInTheDocument();
    expect(within(block).getAllByText(/^Reason:/)).toHaveLength(1);
    expect(view.container.textContent).toContain("Tiling");
  });
});
