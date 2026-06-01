import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageMeter } from "@/components/billing/UsageMeter";

describe("UsageMeter", () => {
  it("renders the used/limit ratio and title", () => {
    render(<UsageMeter title="AI chat" used={5} limit={50} periodEnd="2026-06-01T00:00:00.000Z" />);
    expect(screen.getByText("AI chat")).toBeInTheDocument();
    expect(screen.getByText("5 of 50")).toBeInTheDocument();
  });

  it("shows an unlimited label and no ratio when limit is -1", () => {
    render(<UsageMeter title="Viewers" used={3} limit={-1} />);
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.queryByText(/of/)).not.toBeInTheDocument();
  });

  it("renders the renewal date when a period end is provided", () => {
    render(<UsageMeter title="AI chat" used={1} limit={50} periodEnd="2026-06-01T00:00:00.000Z" />);
    expect(screen.getByText(/Renews/)).toBeInTheDocument();
  });
});
