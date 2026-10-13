import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GenderChoice } from "@/components/settings/GenderChoice";

describe("GenderChoice", () => {
  it("presses exactly the button of the value", () => {
    render(<GenderChoice value="female" onChange={() => {}} />);

    const pressed = screen.getAllByRole("button").map((button) => button.getAttribute("aria-pressed"));
    expect(pressed).toEqual(["false", "true", "false"]);
  });

  it("takes no pick while disabled", () => {
    const onChange = vi.fn();
    render(<GenderChoice value={null} onChange={onChange} disabled />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});
