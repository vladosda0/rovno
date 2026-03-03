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
