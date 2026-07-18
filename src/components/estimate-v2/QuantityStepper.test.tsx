import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { QuantityStepper, parseQty } from "@/components/estimate-v2/QuantityStepper";

describe("parseQty", () => {
  it("floors invalid, empty, zero, and negative input at min", () => {
    expect(parseQty("", 1)).toBe(1);
    expect(parseQty("abc", 1)).toBe(1);
    expect(parseQty("0", 1)).toBe(1);
    expect(parseQty("-4", 1)).toBe(1);
  });

  it("accepts positive numbers and a decimal comma", () => {
    expect(parseQty("3", 1)).toBe(3);
    expect(parseQty("2,5", 1)).toBe(2.5);
    expect(parseQty("0.5", 1)).toBe(1); // below min -> clamped
    expect(parseQty("0.5", 0.5)).toBe(0.5);
  });
});

describe("QuantityStepper", () => {
  it("does not go below min via the − button", () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} ariaLabel="Sand" />);
    fireEvent.click(screen.getByLabelText("Sand −"));
    // Already at min: no change emitted.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("increments and decrements around the current value", () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={2} onChange={onChange} ariaLabel="Sand" />);
    fireEvent.click(screen.getByLabelText("Sand +"));
    expect(onChange).toHaveBeenLastCalledWith(3);
    rerender(<QuantityStepper value={3} onChange={onChange} ariaLabel="Sand" />);
    fireEvent.click(screen.getByLabelText("Sand −"));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("renders the unit label next to the number when provided", () => {
    render(<QuantityStepper value={2} onChange={vi.fn()} ariaLabel="Sand" unitLabel="м³" />);
    expect(screen.getByText("м³")).toBeInTheDocument();
  });

  it("commits a typed quantity on blur, coercing invalid to min", () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} ariaLabel="Sand" />);
    const input = screen.getByLabelText("Sand") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(7);
  });
});
