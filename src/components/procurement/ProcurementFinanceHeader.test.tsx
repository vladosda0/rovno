import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ProcurementFinanceHeader,
  type ProcurementFinanceView,
} from "@/components/procurement/ProcurementFinanceHeader";
import { formatCompactMoney, formatMoney } from "@/lib/estimate-v2/format-money";

// Testing-library normalizes DOM whitespace (incl. NBSP) to plain spaces.
function asText(value: string): string {
  return value.replace(/[  ]/g, " ");
}

// Calibration from the spec (project «test again», Part 2 Appendix B), in cents.
function buildView(overrides: Partial<ProcurementFinanceView> = {}): ProcurementFinanceView {
  return {
    budgetCents: 1_917_600,
    receivedCents: 1_000,
    inTransitCents: 1_551_000,
    usedCents: 1_552_000,
    remainingBudgetCents: 365_600,
    toOrderCents: 365_600,
    inStockValueCents: 120_000,
    hasLinkedItems: true,
    missingPlannedPriceCount: 0,
    missingOrderPriceCount: 0,
    ppv: null,
    inStockByLocation: [],
    lastReceivedAt: null,
    ...overrides,
  };
}

function renderHeader(view: ProcurementFinanceView = buildView()) {
  return render(<ProcurementFinanceHeader view={view} currency="RUB" />);
}

describe("ProcurementFinanceHeader", () => {
  it("renders the three anchor cards and the funnel legend on the «test again» calibration", () => {
    renderHeader();

    expect(screen.getByText("Procurement budget")).toBeInTheDocument();
    expect(screen.getByText(asText(formatCompactMoney(1_917_600, "RUB")))).toBeInTheDocument();
    expect(screen.getByText("Budget left")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();

    // Received and in-transit are two distinct legend entries, not one "used".
    expect(screen.getByText("Received:")).toBeInTheDocument();
    expect(screen.getByText(asText(formatCompactMoney(1_000, "RUB")))).toBeInTheDocument();
    expect(screen.getByText("In transit:")).toBeInTheDocument();
    expect(screen.getByText(asText(formatCompactMoney(1_551_000, "RUB")))).toBeInTheDocument();
    expect(screen.getByText("Left to order:")).toBeInTheDocument();
    // Остаток 3 656 ₽ appears for both the card and the to-order legend value.
    expect(screen.getAllByText(asText(formatCompactMoney(365_600, "RUB"))).length).toBe(2);

    // The misleading old "Used 81%" framing is gone from the strip.
    expect(screen.queryByText("Planned")).not.toBeInTheDocument();
    expect(screen.queryByText("Variance")).not.toBeInTheDocument();
  });

  it("flags the in-transit dominance insight when almost nothing is received", () => {
    renderHeader();
    expect(screen.getByText(/deliveries in transit/)).toBeInTheDocument();
  });

  it("prioritizes the overspend insight and accents the negative remainder", () => {
    renderHeader(buildView({
      receivedCents: 1_000_000,
      inTransitCents: 1_500_000,
      usedCents: 2_500_000,
      remainingBudgetCents: 1_917_600 - 2_500_000,
    }));

    expect(screen.getByText(/budget exceeded by/i)).toBeInTheDocument();
    expect(screen.queryByText(/deliveries in transit/)).not.toBeInTheDocument();
    const remaining = screen.getByText(asText(formatCompactMoney(1_917_600 - 2_500_000, "RUB")));
    expect(remaining.className).toContain("text-destructive");
  });

  it("notes price drift when «left to order» diverges from the bar remainder", () => {
    renderHeader(buildView({
      receivedCents: 1_000_000,
      inTransitCents: 200_000,
      usedCents: 1_200_000,
      remainingBudgetCents: 717_600,
      toOrderCents: 1_000_000,
    }));

    expect(screen.getByText(/prices drifting from plan/)).toBeInTheDocument();
  });

  it("renders em dashes and the missing-price hint when order prices are unknown", () => {
    renderHeader(buildView({
      receivedCents: null,
      inTransitCents: null,
      usedCents: null,
      remainingBudgetCents: null,
      missingOrderPriceCount: 3,
    }));

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Missing ordered price for 3 lines.")).toBeInTheDocument();
  });

  it("shows the whole budget as left-to-order in the empty pipeline state", () => {
    renderHeader(buildView({
      hasLinkedItems: false,
      receivedCents: 0,
      inTransitCents: 0,
      usedCents: 0,
      remainingBudgetCents: 1_917_600,
      toOrderCents: 0,
      inStockValueCents: 0,
    }));

    expect(screen.getByText("No orders yet — the whole budget is free to order")).toBeInTheDocument();
    // Left-to-order legend shows the budget, not the zero requested total.
    expect(screen.getAllByText(asText(formatCompactMoney(1_917_600, "RUB"))).length).toBeGreaterThanOrEqual(2);
  });

  it("shows PPV overpay with per-line breakdown under details", () => {
    renderHeader(buildView({
      ppv: {
        deltaCents: 12_000,
        pct: 4.2,
        lines: [
          { procurementItemId: "p-1", name: "Цемент М500", deltaCents: 9_000 },
          { procurementItemId: "p-2", name: "Грунтовка", deltaCents: 3_000 },
        ],
      },
      inStockByLocation: [
        { locationId: "loc-1", locationName: "Склад на объекте", totalValueCents: 80_000, itemCount: 2 },
      ],
      lastReceivedAt: "2026-06-05T09:00:00.000Z",
    }));

    fireEvent.click(screen.getByRole("button", { name: /Details/ }));

    const overpay = screen.getByText(`${asText(formatMoney(12_000, "RUB"))} · 4,2%`);
    expect(overpay.className).toContain("text-destructive");
    expect(screen.getByText("Цемент М500")).toBeInTheDocument();
    expect(screen.getByText("Склад на объекте · 2 items")).toBeInTheDocument();
    expect(screen.getByText("Last delivery")).toBeInTheDocument();
  });

  it("still reports overpay when the planned base is zero (pct unknown)", () => {
    renderHeader(buildView({
      ppv: { deltaCents: 12_000, pct: null, lines: [{ procurementItemId: "p-1", name: "Доставка", deltaCents: 12_000 }] },
    }));

    // Header insight fires without a pct (overpay against a zero planned base).
    expect(screen.getByText(/Overpaying vs planned prices/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByText("Overpay")).toBeInTheDocument();
    expect(screen.getByText(`${asText(formatMoney(12_000, "RUB"))} · —`)).toBeInTheDocument();
    expect(screen.queryByText("No received lines with known prices yet.")).not.toBeInTheDocument();
  });

  it("labels a negative PPV as savings without the destructive accent", () => {
    renderHeader(buildView({
      ppv: { deltaCents: -5_000, pct: -1.8, lines: [{ procurementItemId: "p-1", name: "Кабель", deltaCents: -5_000 }] },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByText("Savings")).toBeInTheDocument();
    const value = screen.getByText(`${asText(formatMoney(5_000, "RUB"))} · 1,8%`);
    expect(value.className).not.toContain("text-destructive");
  });
});
