import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalStampFormModal } from "@/components/estimate-v2/ApprovalStampFormModal";

describe("ApprovalStampFormModal", () => {
  it("submits stamp payload from entered fields", () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ApprovalStampFormModal
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ivan" } });
    fireEvent.change(screen.getByPlaceholderText("Surname"), { target: { value: "Petrov" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "ivan@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const stamp = onSubmit.mock.calls[0]?.[0];
    expect(stamp.name).toBe("Ivan");
    expect(stamp.surname).toBe("Petrov");
    expect(stamp.email).toBe("ivan@example.com");
    expect(typeof stamp.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(stamp.timestamp))).toBe(false);
  });
});

/**
 * This is the one call site the shared overlay clamp cannot rescue on its own: it
 * passes `overflow-hidden`, and its footer holds the only two exits from the form.
 * On a viewport shorter than the rendered modal those buttons have to stay reachable
 * WITHOUT scrolling, so the modal is a column whose middle band scrolls and whose
 * header and footer do not.
 */
// jsdom's selector engine chokes on `:scope` under Radix's generated ids, so the
// direct children are filtered by hand.
const scrollingChildrenOf = (el: Element) =>
  Array.from(el.children).filter((child) => child.classList.contains("overflow-y-auto"));

describe("ApprovalStampFormModal keeps its exits out of the scrolling region", () => {
  const noop = () => {};
  const renderModal = () =>
    render(<ApprovalStampFormModal open onOpenChange={noop} onSubmit={noop} />);

  it("lays the modal out as a column", () => {
    renderModal();
    const content = screen.getByRole("dialog");
    expect(content.className).toContain("flex");
    expect(content.className).toContain("flex-col");
  });

  it("scrolls the fields, not the whole modal", () => {
    renderModal();
    const content = screen.getByRole("dialog");
    const scrollers = scrollingChildrenOf(content);
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0].querySelector("input")).not.toBeNull();
  });

  it("leaves both exits outside the scrolling band", () => {
    renderModal();
    const content = screen.getByRole("dialog");
    const [scroller] = scrollingChildrenOf(content);
    expect(scroller).toBeDefined();
    for (const name of ["Cancel", "Approve"]) {
      expect(scroller?.contains(screen.getByRole("button", { name }))).toBe(false);
    }
  });
});
