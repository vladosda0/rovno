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
    expect(screen.getByText("Master")).toBeInTheDocument();
    expect(screen.getByText("Crew")).toBeInTheDocument();
  });

  it("derives the monthly price from the plans catalogue", () => {
    renderBlock();
    // 99000 kopecks -> "990 ₽" (no thousands separator at this magnitude).
    expect(screen.getByText("990 ₽")).toBeInTheDocument();
  });

  it("renders an active CTA on every plan", () => {
    // All three plans expose a clickable "Continue" CTA (no "coming soon" gating).
    renderBlock();
    expect(screen.getAllByText("Continue").length).toBe(3);
  });
});
