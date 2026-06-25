import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageMeter } from "@/components/billing/UsageMeter";

describe("UsageMeter", () => {
  it("renders the remaining/limit ratio and title", () => {
    render(<UsageMeter title="AI chat" used={5} limit={50} />);
    expect(screen.getByText("AI chat")).toBeInTheDocument();
    // Shows what's LEFT (50 - 5 = 45), not what's used.
    expect(screen.getByText("45 of 50 left")).toBeInTheDocument();
  });

  it("shows an unlimited label and no ratio when limit is -1", () => {
    render(<UsageMeter title="Viewers" used={3} limit={-1} />);
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.queryByText(/of/)).not.toBeInTheDocument();
  });
});
