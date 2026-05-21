import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PricingBlock } from "@/components/billing/PricingBlock";

function renderBlock() {
  return render(
    <MemoryRouter>
      <PricingBlock />
    </MemoryRouter>,
  );
}

describe("PricingBlock", () => {
  it("renders the free plan and the two paid plans with localized names", () => {
    renderBlock();
    // "Free" appears as both the plan name and its price label, so allow >1.
    expect(screen.getAllByText("Free").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Crew")).toBeInTheDocument();
  });

  it("derives the monthly price from the plans catalogue", () => {
    renderBlock();
    // 99000 kopecks -> "990 ₽" (no thousands separator at this magnitude).
    expect(screen.getByText("990 ₽")).toBeInTheDocument();
  });

  it("marks paid plans as coming soon while billing is disabled", () => {
    // VITE_BILLING_ENABLED is unset under test, so paid CTAs and badges read "Coming soon".
    renderBlock();
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(2);
  });
});
