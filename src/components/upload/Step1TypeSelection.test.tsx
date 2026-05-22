import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Step1TypeSelection } from "@/components/upload/Step1TypeSelection";

describe("Step1TypeSelection", () => {
  it("renders all four type cards", () => {
    render(<Step1TypeSelection onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resource catalog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estimate template" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Business card" })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen type on click", () => {
    const onSelect = vi.fn();
    render(<Step1TypeSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Business card" }));
    expect(onSelect).toHaveBeenCalledWith("visitka");
  });

  it("selects via keyboard (Enter)", () => {
    const onSelect = vi.fn();
    render(<Step1TypeSelection onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Resource catalog" }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("catalog");
  });
});
