import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssigneeCell, type AssigneeOption, type PendingInviteOption } from "@/components/estimate-v2/AssigneeCell";

const participants: AssigneeOption[] = [
  { id: "p1", name: "Alice Smith", email: "alice@example.com" },
  { id: "p2", name: "Alex Stone", email: "alex.one@example.com" },
  { id: "p3", name: "Alex Johnson", email: "alex.two@example.com" },
];

const pendingInvites: PendingInviteOption[] = [
  { id: "inv-1", email: "pending.person@example.com" },
];

describe("AssigneeCell", () => {
  it("saves identity when typed name has no match", async () => {
    const onCommit = vi.fn();

    render(
      <AssigneeCell
        assigneeId={null}
        assigneeName={null}
        assigneeEmail={null}
        participants={participants}
        pendingInvites={pendingInvites}
        editable
        onCommit={onCommit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.change(screen.getByPlaceholderText("Type person name"), { target: { value: "Unique Person" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onCommit).toHaveBeenCalledWith({
      assigneeId: null,
      assigneeName: "Unique Person",
      assigneeEmail: null,
    });
  });

  it("shows participant and pending invite suggestions while typing", async () => {
    render(
      <AssigneeCell
        assigneeId={null}
        assigneeName={null}
        assigneeEmail={null}
        participants={participants}
        pendingInvites={pendingInvites}
        editable
        onCommit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.change(screen.getByPlaceholderText("Type person name"), { target: { value: "ali" } });

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Type person name"), { target: { value: "pending" } });

    expect(screen.getByText("pending.person@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending invite")).toBeInTheDocument();
  });

  it("saves participant assignment when suggestion is selected", async () => {
    const onCommit = vi.fn();

    render(
      <AssigneeCell
        assigneeId={null}
        assigneeName={null}
        assigneeEmail={null}
        participants={participants}
        pendingInvites={pendingInvites}
        editable
        onCommit={onCommit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.change(screen.getByPlaceholderText("Type person name"), { target: { value: "alice" } });
    fireEvent.click(screen.getByText("Alice Smith"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onCommit).toHaveBeenCalledWith({
      assigneeId: "p1",
      assigneeName: "Alice Smith",
      assigneeEmail: "alice@example.com",
    });
  });

  it("keeps identity assignment for ambiguous typed matches without selection", async () => {
    const onCommit = vi.fn();

    render(
      <AssigneeCell
        assigneeId={null}
        assigneeName={null}
        assigneeEmail={null}
        participants={participants}
        pendingInvites={pendingInvites}
        editable
        onCommit={onCommit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.change(screen.getByPlaceholderText("Type person name"), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onCommit).toHaveBeenCalledWith({
      assigneeId: null,
      assigneeName: "Alex",
      assigneeEmail: null,
    });
  });

  it("enables invite for valid email and keeps save independent", async () => {
    const onCommit = vi.fn();
    const onInvite = vi.fn();

    render(
      <AssigneeCell
        assigneeId={null}
        assigneeName={null}
        assigneeEmail={null}
        participants={participants}
        pendingInvites={pendingInvites}
        editable
        onCommit={onCommit}
        onInvite={onInvite}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.change(screen.getByPlaceholderText("Type person name"), { target: { value: "Manual Person" } });
    fireEvent.change(screen.getByPlaceholderText("contractor@example.com"), { target: { value: "manual@example.com" } });

    expect(screen.getByRole("button", { name: "Invite" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(onInvite).toHaveBeenCalledWith({
      name: "Manual Person",
      email: "manual@example.com",
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCommit).toHaveBeenCalledWith({
      assigneeId: null,
      assigneeName: "Manual Person",
      assigneeEmail: "manual@example.com",
    });
  });
});
