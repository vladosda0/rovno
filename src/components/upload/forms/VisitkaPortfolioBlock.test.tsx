import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchPortfolioMock = vi.fn();

vi.mock("@/data/contractor-portfolio-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/contractor-portfolio-source")>()),
  fetchPortfolioObjects: (...args: unknown[]) => fetchPortfolioMock(...args),
}));

import { VisitkaPortfolioBlock } from "@/components/upload/forms/VisitkaPortfolioBlock";
import { movedOrder } from "@/lib/portfolio-order";

const object = (i: number) => ({
  id: `obj-${i}`,
  org_id: "o1",
  title: `Объект ${i}`,
  photos: [`https://cdn.test/${i}.jpg`],
  position: i,
});

function renderBlock(orgId: string | null, canEdit = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VisitkaPortfolioBlock orgId={orgId} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe("VisitkaPortfolioBlock", () => {
  beforeEach(() => {
    fetchPortfolioMock.mockReset();
  });

  it("asks to save the card first when there is none yet", () => {
    renderBlock(null);
    expect(screen.getByText("Save the card first, then add projects")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add project" })).not.toBeInTheDocument();
    expect(fetchPortfolioMock).not.toHaveBeenCalled();
  });

  it("lists the objects with a counter and an add tile", async () => {
    fetchPortfolioMock.mockResolvedValue([object(0), object(1)]);
    renderBlock("o1");
    expect(await screen.findAllByTestId("portfolio-form-object")).toHaveLength(2);
    expect(screen.getByTestId("portfolio-object-count")).toHaveTextContent("2 of 12");
    expect(screen.getByText("Finished projects with photos. Drag a tile to change the order.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    const editor = await screen.findByTestId("portfolio-editor");
    expect(within(editor).getByText("New project")).toBeInTheDocument();
  });

  it("opens an object for editing from its tile", async () => {
    fetchPortfolioMock.mockResolvedValue([object(0)]);
    renderBlock("o1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit project" }));
    const editor = await screen.findByTestId("portfolio-editor");
    expect(within(editor).getByRole("textbox")).toHaveValue("Объект 0");
  });

  it("shows nothing to a member who cannot manage the organization", () => {
    fetchPortfolioMock.mockResolvedValue([object(0)]);
    renderBlock("o1", false);
    expect(screen.queryByTestId("visitka-portfolio-block")).not.toBeInTheDocument();
    expect(fetchPortfolioMock).not.toHaveBeenCalled();
  });

  it("drops the add tile at 12 objects", async () => {
    fetchPortfolioMock.mockResolvedValue(Array.from({ length: 12 }, (_, i) => object(i)));
    renderBlock("o1");
    expect(await screen.findAllByTestId("portfolio-form-object")).toHaveLength(12);
    expect(screen.getByTestId("portfolio-object-count")).toHaveTextContent("12 of 12");
    expect(screen.queryByRole("button", { name: "Add project" })).not.toBeInTheDocument();
  });
});

describe("movedOrder", () => {
  it("moves an id to the drop place", () => {
    expect(movedOrder(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(movedOrder(["a", "b", "c", "d"], "d", "a")).toEqual(["d", "a", "b", "c"]);
  });

  it("does nothing when nothing moved", () => {
    expect(movedOrder(["a", "b"], "a", "a")).toBeNull();
    expect(movedOrder(["a", "b"], "a", null)).toBeNull();
    expect(movedOrder(["a", "b"], "x", "a")).toBeNull();
  });
});
