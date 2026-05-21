import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CheckoutBlocked } from "@/components/billing/CheckoutBlocked";

describe("CheckoutBlocked", () => {
  it("shows the existing plan, end date, and a link to settings", () => {
    render(
      <MemoryRouter>
        <CheckoutBlocked
          planName="Дом"
          periodEndsLabel="20 June 2026"
          manageHref="/settings?tab=billing"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("You already have a subscription")).toBeInTheDocument();
    expect(screen.getByText(/Дом/)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /go to settings/i });
    expect(cta).toHaveAttribute("href", "/settings?tab=billing");
  });
});
