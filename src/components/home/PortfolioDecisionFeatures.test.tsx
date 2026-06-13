import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PortfolioDecisionPanel } from "@/components/home/PortfolioDecisionPanel";
import {
  EMPTY_PORTFOLIO_SNAPSHOT,
  type PortfolioFinanceSnapshot,
} from "@/lib/finance/portfolio-read-model";

function snapshot(marginPct: number | null, atRiskCount = 0): PortfolioFinanceSnapshot {
  return {
    ...EMPTY_PORTFOLIO_SNAPSHOT,
    totals: {
      ...EMPTY_PORTFOLIO_SNAPSHOT.totals,
      contractValueCents: 10_000_000,
      marginCents: marginPct != null ? Math.round(10_000_000 * (marginPct / 100)) : 0,
      marginPct,
      atRiskCount,
    },
  };
}

describe("PortfolioDecisionPanel", () => {
  it("shows the standing verdict and its generic description from known data", () => {
    render(<PortfolioDecisionPanel snapshot={snapshot(18, 0)} currency="RUB" />);
    expect(screen.getByText("Portfolio verdict")).toBeInTheDocument();
    expect(screen.getByText("Likely yes")).toBeInTheDocument();
    // The horoscope-style description is present.
    expect(screen.getByText(/The portfolio is in good shape/)).toBeInTheDocument();
    expect(screen.getByText(/Add a potential project's details/)).toBeInTheDocument();
  });

  it("renders a no verdict in destructive style", () => {
    render(<PortfolioDecisionPanel snapshot={snapshot(5, 0)} currency="RUB" />);
    const verdict = screen.getByText("No");
    expect(verdict.className).toContain("text-destructive");
    expect(screen.getByText(/below a comfortable level/)).toBeInTheDocument();
  });

  it("recomputes the SAME verdict once a potential project is supplied", () => {
    render(<PortfolioDecisionPanel snapshot={snapshot(18, 0)} currency="RUB" />);
    expect(screen.getByText("Portfolio verdict")).toBeInTheDocument();
    expect(screen.queryByText("Verdict with the new project")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/New contract/), { target: { value: "50000000" } });
    fireEvent.change(screen.getByLabelText(/Expected margin/), { target: { value: "1" } });

    // The single verdict label switches to the projected mode and the verdict updates.
    expect(screen.getByText("Verdict with the new project")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument(); // huge thin project drags margin under min
    expect(screen.getByText(/Added backlog:/)).toBeInTheDocument();
  });

  it("stays on the standing verdict until a margin is entered (no phantom 100% project)", () => {
    render(<PortfolioDecisionPanel snapshot={snapshot(18, 0)} currency="RUB" />);
    fireEvent.change(screen.getByLabelText(/New contract/), { target: { value: "50000000" } });
    // Margin blank → still the standing portfolio verdict, not the projected one.
    expect(screen.getByText("Portfolio verdict")).toBeInTheDocument();
    expect(screen.queryByText("Verdict with the new project")).not.toBeInTheDocument();
  });
});
