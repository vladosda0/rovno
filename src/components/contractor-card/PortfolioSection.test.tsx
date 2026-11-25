import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const fetchPortfolioMock = vi.fn();

vi.mock("@/data/contractor-portfolio-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/contractor-portfolio-source")>()),
  fetchPortfolioObjects: (...args: unknown[]) => fetchPortfolioMock(...args),
}));

import { ContractorCardWindow } from "@/components/contractor-card/ContractorCardWindow";
import type { ContractorCardData } from "@/components/contractor-card/ContractorCardFace";

const card: ContractorCardData = {
  display_name: "ООО Ремонт",
  contacts: { phone: "+7 812 000-00-00", telegram: "@remont" },
  region: "Спб",
  specializations: ["отделка"],
  experience_years: 12,
  avatar_url: "",
  description: "Ремонт под ключ",
  inn: "7800000000",
  appearance: {},
};

const photo = (n: number) => `https://cdn.test/storage/v1/object/public/avatars/u/${n}.jpg`;
const object = (i: number, photos = 3) => ({
  id: `obj-${i}`,
  org_id: "o1",
  title: `Объект ${i}`,
  photos: Array.from({ length: photos }, (_, n) => photo(i * 10 + n)),
  position: i,
});

function renderWindow(canEdit: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogPrimitive.Root open>
        <DialogPrimitive.Content aria-describedby={undefined}>
          <ContractorCardWindow card={card} check={null} details={null} portfolio={{ orgId: "o1", canEdit }} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Root>
    </QueryClientProvider>,
  );
}

function headings() {
  return screen.getAllByRole("heading", { level: 4 }).map((node) => node.textContent);
}

describe("portfolio in the card window", () => {
  beforeEach(() => {
    fetchPortfolioMock.mockReset();
  });

  it("stands after the contacts and social links, before the requisites", async () => {
    fetchPortfolioMock.mockResolvedValue([object(0), object(1)]);
    renderWindow(false);
    await screen.findAllByTestId("portfolio-tile");
    expect(headings()).toEqual(["About", "Specializations", "Contacts", "Social media and messengers", "Portfolio", "Requisites"]);
    expect(fetchPortfolioMock).toHaveBeenCalledWith("o1");
  });

  it("shows six tiles and a link to the rest", async () => {
    fetchPortfolioMock.mockResolvedValue(Array.from({ length: 7 }, (_, i) => object(i)));
    renderWindow(false);
    expect(await screen.findAllByTestId("portfolio-tile")).toHaveLength(6);
    expect(screen.getAllByText("3 photos")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show all, 7" }));
    expect(screen.getAllByTestId("portfolio-tile")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("gives an owner without objects a hint with a button", async () => {
    fetchPortfolioMock.mockResolvedValue([]);
    renderWindow(true);
    const empty = await screen.findByTestId("portfolio-empty");
    expect(within(empty).getByText("Show clients your finished projects")).toBeInTheDocument();
    fireEvent.click(within(empty).getByRole("button", { name: "Add project" }));
    expect(await screen.findByTestId("portfolio-editor")).toBeInTheDocument();
  });

  it("hides the section from a member while it is empty", async () => {
    fetchPortfolioMock.mockResolvedValue([]);
    renderWindow(false);
    await waitFor(() => expect(fetchPortfolioMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(headings()).not.toContain("Portfolio");
  });

  it("opens an object, pages through its photos without wrapping, and Esc returns to the tile", async () => {
    fetchPortfolioMock.mockResolvedValue([object(0, 3), object(1, 1)]);
    renderWindow(false);
    const [tile] = await screen.findAllByTestId("portfolio-tile");
    tile.focus();
    fireEvent.click(tile);

    const viewer = await screen.findByTestId("portfolio-viewer");
    expect(within(viewer).getByText("1 of 3")).toBeInTheDocument();
    const prev = within(viewer).getByRole("button", { name: "Previous photo" });
    const next = within(viewer).getByRole("button", { name: "Next photo" });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(within(viewer).getByText("3 of 3")).toBeInTheDocument();
    expect(next).toBeDisabled();
    fireEvent.click(within(viewer).getByRole("button", { name: "Photo 1" }));
    expect(within(viewer).getByText("1 of 3")).toBeInTheDocument();
    expect(within(viewer).getByRole("img")).toHaveAttribute("src", photo(0));

    fireEvent.keyDown(viewer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("portfolio-viewer")).not.toBeInTheDocument());
    expect(screen.getAllByTestId("portfolio-tile")).toHaveLength(2);
    await waitFor(() => expect(tile).toHaveFocus());
  });

  it("shows a single photo without arrows, counter or thumbnails", async () => {
    fetchPortfolioMock.mockResolvedValue([object(1, 1)]);
    renderWindow(false);
    fireEvent.click(await screen.findByTestId("portfolio-tile"));
    const viewer = await screen.findByTestId("portfolio-viewer");
    expect(within(viewer).queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
    expect(within(viewer).queryByTestId("portfolio-position")).not.toBeInTheDocument();
    expect(within(viewer).queryByRole("button", { name: "Photo 1" })).not.toBeInTheDocument();
  });

  it("pages by swipe", async () => {
    fetchPortfolioMock.mockResolvedValue([object(0, 3)]);
    renderWindow(false);
    fireEvent.click(await screen.findByTestId("portfolio-tile"));
    const viewer = await screen.findByTestId("portfolio-viewer");
    const stage = within(viewer).getByRole("img").parentElement as HTMLElement;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300 }], changedTouches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { touches: [], changedTouches: [{ clientX: 200 }] });
    expect(within(viewer).getByText("2 of 3")).toBeInTheDocument();
  });
});
