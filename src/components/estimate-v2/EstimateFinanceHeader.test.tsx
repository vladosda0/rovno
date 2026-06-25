import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  EstimateFinanceHeader,
  type EstimateFinanceView,
} from "@/components/estimate-v2/EstimateFinanceHeader";
import { formatCompactMoney, formatMoney } from "@/lib/estimate-v2/format-money";
import type { EstimateExecutionStatus, ResourceLineType } from "@/types/estimate-v2";
import type { EstimateFinanceVisibilityMode } from "@/lib/permissions";

// Testing-library normalizes DOM whitespace (incl. NBSP) to plain spaces; do the
// same to the Intl output so formatter-built matchers line up.
function asText(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, " ");
}

const emptyByType = (): Record<ResourceLineType, number> => ({
  material: 0,
  tool: 0,
  labor: 0,
  subcontractor: 0,
  overhead: 0,
  other: 0,
});

// Calibration from the spec (Берёзки-1, Appendix B).
function buildView(overrides: Partial<EstimateFinanceView> = {}): EstimateFinanceView {
  return {
    revenueExVatCents: 464_947_500,
    costTotalCents: 437_692_000,
    profitExVatCents: 27_255_500,
    profitabilityPct: 5.86,
    hasActualFinancialData: true,
    spentCents: 247_130_000,
    utilizationPct: 56.46,
    overspendCents: 247_130_000 - 437_692_000,
    completion: { done: 8, total: 45, pct: 17.8 },
    toBePaidPlannedCents: 100_000_00,
    daysToEnd: 14,
    behindScheduleDays: 0,
    planningRangeLabel: "—",
    planningDurationDays: null,
    markupTotalCents: 42_707_200,
    subtotalBeforeDiscountCents: 480_399_200,
    discountTotalCents: 15_451_700,
    taxAmountCents: 102_288_400,
    totalIncVatCents: 567_235_900,
    plannedCostByTypeCents: { ...emptyByType(), material: 244_192_000, labor: 103_250_000 },
    spentByTypeCents: { ...emptyByType(), labor: 73_350_000 },
    unattributedSpendCents: 0,
    eac: null,
    finishedAccuracy: null,
    operationalUpperBlock: null,
    rpcSummaryTotalIncVatCents: null,
    uiTotalIncVatCents: 567_235_900,
    taxBps: 2200,
    ...overrides,
  };
}

function renderHeader(input: {
  status?: EstimateExecutionStatus;
  financeMode?: EstimateFinanceVisibilityMode;
  view?: EstimateFinanceView;
}) {
  return render(
    <EstimateFinanceHeader
      status={input.status ?? "in_work"}
      financeMode={input.financeMode ?? "detail"}
      useReadOnlySummaryPricing={false}
      currency="RUB"
      isContractorMode
      view={input.view ?? buildView()}
      resourceKeyLabel={(key) => key}
    />,
  );
}

describe("EstimateFinanceHeader", () => {
  it("shows margin and the completion/utilization pair in work mode without expanding details", () => {
    renderHeader({ status: "in_work" });

    expect(screen.getByText("Margin %")).toBeInTheDocument();
    expect(screen.getByText("5,9%")).toBeInTheDocument();
    expect(screen.getByText("Completion")).toBeInTheDocument();
    expect(screen.getByText("18%")).toBeInTheDocument();
    // Risk line: 56% spent at 18% done (gap ≥ 20 pp).
    expect(screen.getByText("56% spent at 18% done")).toBeInTheDocument();
    // Details stay collapsed by default.
    expect(screen.getByRole("button", { name: /Details/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders each grand total exactly once in the strip", () => {
    renderHeader({ status: "in_work" });
    expect(screen.getAllByText(asText(formatCompactMoney(464_947_500, "RUB")))).toHaveLength(1);
    expect(screen.getAllByText(asText(formatCompactMoney(437_692_000, "RUB")))).toHaveLength(1);
  });

  it("hides execution metrics in planning mode", () => {
    renderHeader({ status: "planning", view: buildView({ hasActualFinancialData: false }) });
    expect(screen.getByText("Margin %")).toBeInTheDocument();
    expect(screen.queryByText("Completion")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows EAC rows under details in work mode, with em dash under the guard", () => {
    renderHeader({ status: "in_work", view: buildView({ eac: null }) });
    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByText("Cost forecast (EAC)")).toBeInTheDocument();
    const overrunRow = screen.getByText("Forecast overrun").parentElement!;
    expect(overrunRow.textContent).toContain("—");
  });

  it("shows EAC values and accents the forecast overrun once past the guard", () => {
    renderHeader({
      status: "in_work",
      view: buildView({
        completion: { done: 23, total: 45, pct: 51.1 },
        eac: { eacCents: 494_260_000, overrunCents: 56_568_000, cpi: 0.886 },
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByText(asText(formatMoney(494_260_000, "RUB")))).toBeInTheDocument();
    const overrunValue = screen.getByText(asText(formatMoney(56_568_000, "RUB")));
    expect(overrunValue.className).toContain("text-destructive");
  });

  it("adds the unattributed spend row so the fact column reconciles", () => {
    renderHeader({ status: "in_work", view: buildView({ unattributedSpendCents: 168_180_000 }) });
    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByText("Unattributed spend")).toBeInTheDocument();
    expect(screen.getByText(asText(formatMoney(168_180_000, "RUB")))).toBeInTheDocument();
  });

  it("switches the strip to fact totals and estimate accuracy when finished", () => {
    renderHeader({
      status: "finished",
      view: buildView({
        spentCents: 494_260_000,
        finishedAccuracy: {
          costDeltaPct: 12.9,
          marginFactPct: -6.3,
          marginDeltaPp: -12.2,
          durationFactDays: 36,
          durationDeltaDays: 6,
        },
      }),
    });

    expect(screen.getByText("Final cost")).toBeInTheDocument();
    expect(screen.getByText("Estimate accuracy")).toBeInTheDocument();
    const accuracy = screen.getByText("+13%");
    expect(accuracy.className).toContain("text-destructive");
    expect(screen.getByText("Final margin %")).toBeInTheDocument();
    expect(screen.queryByText("Completion")).not.toBeInTheDocument();
    // No utilization bar on the finished strip.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("uses the completion-free risk message when completion is unmeasured", () => {
    renderHeader({
      status: "in_work",
      view: buildView({
        utilizationPct: 105,
        overspendCents: 20_000_000,
        completion: { done: 0, total: 0, pct: null },
      }),
    });
    // Must not fabricate "0% done" for a completion that was never measured.
    expect(screen.queryByText(/at 0% done/)).not.toBeInTheDocument();
    expect(screen.getByText("105% of cost spent")).toBeInTheDocument();
  });

  it("omits the noDates sub on the finished term card when only the baseline is missing", () => {
    renderHeader({
      status: "finished",
      view: buildView({
        finishedAccuracy: {
          costDeltaPct: 5,
          marginFactPct: 4,
          marginDeltaPp: null,
          durationFactDays: 36,
          durationDeltaDays: null,
        },
      }),
    });
    expect(screen.getByText("36 d")).toBeInTheDocument();
    expect(screen.queryByText("dates not set")).not.toBeInTheDocument();
  });

  it("never renders a signed zero for sub-rounding accuracy deltas", () => {
    renderHeader({
      status: "finished",
      view: buildView({
        finishedAccuracy: {
          costDeltaPct: 0.4,
          marginFactPct: 5.9,
          marginDeltaPp: -0.04,
          durationFactDays: 30,
          durationDeltaDays: 0,
        },
      }),
    });
    const accuracy = screen.getByText("0%");
    expect(accuracy.className).not.toContain("text-destructive");
    expect(screen.queryByText(/\+0%/)).not.toBeInTheDocument();
    const marginSub = screen.getByText(/Δ vs estimate/);
    expect(marginSub.textContent).toBe("Δ vs estimate: 0 pp");
    expect(marginSub.className).not.toContain("text-destructive");
  });

  it("keeps the execution layout on finished projects without fact data", () => {
    renderHeader({
      status: "finished",
      view: buildView({ hasActualFinancialData: false, finishedAccuracy: null }),
    });
    expect(screen.getByText("Completion")).toBeInTheDocument();
    expect(screen.queryByText("Estimate accuracy")).not.toBeInTheDocument();
  });

  it("never leaks cost or margin in summary mode", () => {
    renderHeader({ status: "in_work", financeMode: "summary" });
    expect(screen.getByText("Total (inc VAT)")).toBeInTheDocument();
    expect(screen.queryByText("Margin %")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost")).not.toBeInTheDocument();
    expect(screen.queryByText(asText(formatCompactMoney(437_692_000, "RUB")))).not.toBeInTheDocument();
  });

  it("renders only the placeholder in none mode", () => {
    renderHeader({ status: "in_work", financeMode: "none" });
    expect(screen.getByText("Financial details are not shown for your access level.")).toBeInTheDocument();
    expect(screen.queryByText("Margin %")).not.toBeInTheDocument();
  });
});
