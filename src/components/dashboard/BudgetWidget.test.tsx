import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BudgetWidget } from "@/components/dashboard/BudgetWidget";
import { formatCompactMoney } from "@/lib/estimate-v2/format-money";

function asText(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, " ");
}
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";

// Calibration from the spec (Берёзки-1, Part 4 Appendix B).
function buildSummary(overrides: Partial<EstimateV2FinanceProjectSummary> = {}): EstimateV2FinanceProjectSummary {
  return {
    projectId: "project-1",
    projectTitle: "Project One",
    currency: "RUB",
    hasEstimate: true,
    status: "in_work",
    stageCount: 2,
    workCount: 3,
    lineCount: 4,
    plannedBudgetCents: 437_692_000,
    spentCents: 247_130_000,
    toBePaidCents: 80_000,
    varianceCents: 437_692_000 - 247_130_000,
    percentSpent: 56,
    percentProfitability: 5.86,
    contractValueCents: 464_947_500,
    costCents: 437_692_000,
    marginCents: 27_255_500,
    percentUtilization: 56.46,
    daysToEnd: null,
    behindScheduleDays: 0,
    ...overrides,
  };
}

function renderBudgetWidget(
  summary: EstimateV2FinanceProjectSummary | null,
  isLoading = false,
) {
  return render(
    <MemoryRouter>
      <BudgetWidget summary={summary} projectId="project-1" isLoading={isLoading} />
    </MemoryRouter>,
  );
}

describe("BudgetWidget", () => {
  it("shows an empty state when estimate-v2 has no budget data yet", () => {
    renderBudgetWidget(buildSummary({
      hasEstimate: false,
      status: null,
      contractValueCents: 0,
      costCents: 0,
      marginCents: 0,
      percentUtilization: null,
    }));

    expect(screen.getByText("Plan your budget to track spending and upcoming payments.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start planning" })).toHaveAttribute("href", "/project/project-1/estimate");
  });

  it("shows a skeleton instead of the empty CTA while workspace data hydrates", () => {
    const { container } = renderBudgetWidget(null, true);
    expect(screen.queryByRole("link", { name: "Start planning" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders revenue, margin, utilization, and term on the cost basis", () => {
    renderBudgetWidget(buildSummary());

    expect(screen.getByText("Revenue (ex VAT)")).toBeInTheDocument();
    expect(screen.getByText(asText(formatCompactMoney(464_947_500, "RUB")))).toBeInTheDocument();
    expect(screen.getByText("Margin %")).toBeInTheDocument();
    expect(screen.getByText("5,9%")).toBeInTheDocument();
    // Освоение from cost (56%), not from the client price.
    expect(screen.getByText("Spend of cost")).toBeInTheDocument();
    expect(screen.getByText("56%")).toBeInTheDocument();
    // Dates not set → em dash term.
    expect(screen.getByText("Term")).toBeInTheDocument();
    expect(screen.getByText("dates not set")).toBeInTheDocument();
  });

  it("drives the progress bar from utilization, neutral under budget", () => {
    const { container } = renderBudgetWidget(buildSummary());
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator?.className).toContain("bg-foreground");
    expect(indicator?.className).not.toContain("bg-destructive");
  });

  it("turns the progress bar red on overrun", () => {
    const { container } = renderBudgetWidget(buildSummary({
      spentCents: 500_000_000,
      percentUtilization: 114.2,
    }));
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator?.className).toContain("bg-destructive");
  });

  it("accents spend against a zero-cost plan like the estimate header does", () => {
    renderBudgetWidget(buildSummary({
      costCents: 0,
      marginCents: 0,
      spentCents: 10_000,
      percentUtilization: null,
    }));
    const spentSub = screen.getByText(/Spent:/);
    expect(spentSub.className).toContain("text-destructive");
  });

  it("shows the behind-schedule accent on the term card", () => {
    renderBudgetWidget(buildSummary({ daysToEnd: 0, behindScheduleDays: 5 }));
    const behind = screen.getByText("behind: 5 d");
    expect(behind.className).toContain("text-destructive");
  });
});
