import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BudgetWidget } from "@/components/dashboard/BudgetWidget";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";

function renderBudgetWidget(summary: EstimateV2FinanceProjectSummary | null) {
  return render(
    <MemoryRouter>
      <BudgetWidget summary={summary} projectId="project-1" />
    </MemoryRouter>,
  );
}

describe("BudgetWidget", () => {
  it("shows an empty state when estimate-v2 has no budget data yet", () => {
    renderBudgetWidget({
      projectId: "project-1",
      projectTitle: "Project One",
      currency: "RUB",
      hasEstimate: false,
      status: null,
      stageCount: 0,
      workCount: 0,
      lineCount: 0,
      plannedBudgetCents: 0,
      spentCents: 0,
      toBePaidCents: 0,
      varianceCents: 0,
      percentSpent: 0,
      percentProfitability: null,
    });

    expect(screen.getByText("Plan your budget to track spending and upcoming payments.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start planning" })).toHaveAttribute("href", "/project/project-1/estimate");
  });

  it("renders the estimate-v2 summary metrics without the legacy unpaid item list", () => {
    renderBudgetWidget({
      projectId: "project-1",
      projectTitle: "Project One",
      currency: "RUB",
      hasEstimate: true,
      status: "in_work",
      stageCount: 2,
      workCount: 3,
      lineCount: 4,
      plannedBudgetCents: 120_000,
      spentCents: 40_000,
      toBePaidCents: 80_000,
      varianceCents: 80_000,
      percentSpent: 33,
      percentProfitability: 67,
    });

    expect(screen.getByText("67.0%")).toBeInTheDocument();
    expect(screen.getByText("% profitability")).toBeInTheDocument();
    expect(screen.getByText(/1\s?200\s?₽/)).toBeInTheDocument();
    expect(screen.getByText(/400\s?₽/)).toBeInTheDocument();
    expect(screen.getByText(/800\s?₽/)).toBeInTheDocument();
    expect(screen.queryByText("Urgent unpaid")).not.toBeInTheDocument();
  });
});
