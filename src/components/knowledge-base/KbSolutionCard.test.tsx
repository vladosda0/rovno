import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { normalizeKbSolution, type KbFactChip } from "@/lib/knowledge-base/kbSolutions.mjs";
import { SEAMS_ROW, SOLUTION_ROW } from "@/lib/knowledge-base/kbSolutions.fixture";

// Radix Select in jsdom: pointer capture + scrollIntoView used by focus management.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

let mobile = false;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile }));
let historyRows: Record<string, unknown>[] = [];
vi.mock("@/hooks/use-knowledge-base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-knowledge-base")>()),
  useKbHistory: () => ({ data: historyRows, isLoading: false, isError: false }),
}));

import { KbSolutionCard } from "./KbSolutionCard";

const solution = normalizeKbSolution(SOLUTION_ROW);
const guestHref = (chip: KbFactChip) => (chip.docSlug ? `/baza/${chip.docSlug}/#${chip.anchor}` : null);

function renderCard(card = solution) {
  return render(
    <MemoryRouter>
      <KbSolutionCard solution={card} clauseHref={guestHref} />
    </MemoryRouter>,
  );
}

/** The <li>/<tr> that holds an item text. */
const item = (text: string) => screen.getByText(text).closest("[data-kb-item]") as HTMLElement;

beforeEach(() => {
  window.sessionStorage.clear();
  mobile = false;
  historyRows = [];
});

describe("KbSolutionCard", () => {
  it("shows the label and the sections; the documents and the check date live in the label window (slice 7)", () => {
    renderCard();
    expect(screen.getByText("Checked 25.10.2026")).toBeInTheDocument();
    for (const name of ["Steps", "Where the sources differ", "Numbers", "What to check on acceptance"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText("Checked against the sources, 25.10.2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents: СП 163.1325800, СП 71.13330")).not.toBeInTheDocument();
    expect(screen.getByText(/The card retells the codes in its own words/)).toBeInTheDocument();
  });

  it("opens one window under the label: details on top, history below", () => {
    historyRows = [{ occurred_on: "2026-10-25", event: "checked" }];
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Checked 25.10.2026" }));
    const win = document.querySelector("[data-kb-window]") as HTMLElement;
    expect(within(win).getByText("Details")).toBeInTheDocument();
    expect(within(win).getByText("СП 163.1325800, СП 71.13330")).toBeInTheDocument();
    expect(within(win).getByText("History")).toBeInTheDocument();
    expect(within(win).getByText("25.10.2026")).toBeInTheDocument();
    expect(within(win).getByText("published, checked against the sources")).toBeInTheDocument();
  });

  it("on a computer, hover opens the window and a press keeps it open; leaving closes it", async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === "(hover: hover)", media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
    vi.useFakeTimers();
    try {
      renderCard();
      const label = screen.getByRole("button", { name: "Checked 25.10.2026" });
      fireEvent.mouseEnter(label);
      expect(document.querySelector("[data-kb-window]")).not.toBeNull();
      fireEvent.click(label);
      expect(document.querySelector("[data-kb-window]")).not.toBeNull();
      fireEvent.mouseLeave(label);
      act(() => vi.advanceTimersByTime(200));
      expect(document.querySelector("[data-kb-window]")).toBeNull();
      // After a hover that ended by leaving, a keyboard press opens and the next one closes.
      fireEvent.mouseEnter(label);
      fireEvent.mouseLeave(label);
      act(() => vi.advanceTimersByTime(200));
      expect(document.querySelector("[data-kb-window]")).toBeNull();
      fireEvent.click(label);
      expect(document.querySelector("[data-kb-window]")).not.toBeNull();
      fireEvent.click(label);
      expect(document.querySelector("[data-kb-window]")).toBeNull();
    } finally {
      vi.useRealTimers();
      window.matchMedia = matchMedia;
    }
  });

  it("turns yellow «Being checked» while a document under the card changed", () => {
    historyRows = [{ occurred_on: "2027-06-01", event: "solution_checking", doc_designation: "СП 71.13330" }];
    renderCard({ ...solution, recheckSince: "2027-06-01" });
    const label = screen.getByRole("button", { name: "Being checked" });
    expect(label).toHaveAttribute("data-kb-label", "checking");
    fireEvent.click(label);
    expect(screen.getByText("СП 71.13330 changed, the solution is being rechecked")).toBeInTheDocument();
  });

  it("opens on the first option of each condition; the toggles change steps, numbers and acceptance", () => {
    renderCard();
    expect(screen.getByRole("radio", { name: "Гипсокартон ГКЛВ" })).toHaveAttribute("aria-checked", "true");
    expect(item("Поверхности листов ГКЛВ покрыть гидроизолирующим составом.")).toBeVisible();
    expect(item("Основание из бетона огрунтовать перед облицовкой.")).not.toBeVisible();
    expect(item("Заход полосы гидроизоляции на листы")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Бетон, кирпич, штукатурка" }));
    expect(item("Поверхности листов ГКЛВ покрыть гидроизолирующим составом.")).not.toBeVisible();
    expect(item("Основание из бетона огрунтовать перед облицовкой.")).toBeVisible();
    expect(item("Заход полосы гидроизоляции на листы")).not.toBeVisible();
    // An item without a case shows in every case.
    expect(item("Облицовку стен делать до устройства покрытия пола.")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Гипсокартон ГКЛВ" }));
    fireEvent.click(screen.getByRole("radio", { name: "Сухая стена" }));
    expect(item("Гидроизоляция нанесена на все места, куда прямо попадает вода.")).not.toBeVisible();
    expect(item("Под нижнюю направляющую уложить полосу рулонной гидроизоляции.")).toBeVisible();
    // Every case stays in the page, only hidden.
    expect(screen.getByText("Основание из бетона огрунтовать перед облицовкой.")).toBeInTheDocument();
  });

  it("remembers the chosen case for the visit", () => {
    const { unmount } = renderCard();
    fireEvent.click(screen.getByRole("radio", { name: "Бетон, кирпич, штукатурка" }));
    unmount();
    renderCard();
    expect(screen.getByRole("radio", { name: "Бетон, кирпич, штукатурка" })).toHaveAttribute("aria-checked", "true");
  });

  it("marks a recommendation", () => {
    renderCard();
    expect(within(item("Под нижнюю направляющую уложить полосу рулонной гидроизоляции.")).getByText("(recommendation)")).toBeInTheDocument();
    expect(within(item("Облицовку стен делать до устройства покрытия пола.")).queryByText("(recommendation)")).toBeNull();
  });

  it("opens the quote and a link to the clause from a source chip", () => {
    renderCard();
    const step = item("Поверхности листов ГКЛВ покрыть гидроизолирующим составом.");
    fireEvent.click(within(step).getByRole("button", { name: "СП 163, п. 6.4.2.8" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("СП 163.1325800 · п. 6.4.2.8")).toBeInTheDocument();
    expect(within(dialog).getByText("«…должны быть покрыты гидроизолирующим составом…»")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open the clause in the document" })).toHaveAttribute(
      "href",
      "/baza/sp-163-1325800/#p-6-4-2-8",
    );
  });

  it("lists the quote of every fact a chip stands for", () => {
    renderCard(normalizeKbSolution(SEAMS_ROW));
    const row = item("Пауза перед затиркой швов");
    expect(within(row).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(row).getByRole("button", { name: "СП 71, п. 7.4.13" }));
    const quotes = [...screen.getByRole("dialog").querySelectorAll("blockquote")];
    expect(quotes.map((q) => q.textContent)).toEqual([
      "«…швы должны быть заполнены специальными шовными материалами…»",
      "«…допускается сокращение технологической паузы, если это предусмотрено ПР или требованием производителя материала клеевой прослойки…»",
    ]);
  });

  it("turns the toggles into dropdowns on a narrow screen", async () => {
    mobile = true;
    renderCard();
    expect(screen.queryByRole("radio")).toBeNull();
    const base = screen.getByRole("combobox", { name: "Основание" });
    expect(base).toHaveTextContent("Гипсокартон ГКЛВ");
    expect(item("Основание из бетона огрунтовать перед облицовкой.")).not.toBeVisible();

    fireEvent.click(base);
    fireEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Бетон, кирпич, штукатурка" }));
    expect(screen.getByRole("combobox", { name: "Основание" })).toHaveTextContent("Бетон, кирпич, штукатурка");
    expect(item("Основание из бетона огрунтовать перед облицовкой.")).toBeVisible();
    expect(item("Поверхности листов ГКЛВ покрыть гидроизолирующим составом.")).not.toBeVisible();
  });
});
