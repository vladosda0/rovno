import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { SecurityPanel } from "@/components/settings/panels/SecurityPanel";
import { __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

const { updateUserMock } = vi.hoisted(() => ({ updateUserMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: updateUserMock } },
}));

function signInAs(userMetadata: Record<string, unknown>) {
  const user = { id: "u1", email: "a@b.co", user_metadata: userMetadata } as unknown as User;
  __unsafeSetRuntimeAuthStateForTests({
    status: "authenticated",
    session: { user } as unknown as Session,
    user,
    profileId: "u1",
  });
}

describe("SecurityPanel · password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("an account registered by code has no password yet", () => {
    signInAs({ passwordless: true });
    render(<SecurityPanel />);
    expect(screen.getByText("Password not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set password" })).toBeInTheDocument();
  });

  it("an account without the marker has a password", () => {
    signInAs({});
    render(<SecurityPanel />);
    expect(screen.getByText("Password set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });

  it("opens two empty fields in the row itself, without a dialog", () => {
    signInAs({ passwordless: true });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    const next = screen.getByLabelText("New password");
    const again = screen.getByLabelText("Confirm password");
    for (const field of [next, again]) {
      expect(field).toHaveAttribute("type", "password");
      expect(field).toHaveValue("");
      expect(field).not.toHaveAttribute("placeholder");
    }

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("checks length and match before saving", () => {
    signInAs({ passwordless: true });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Password must be at least 6 characters.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret13" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Passwords do not match. Please enter the same password twice.")).toBeInTheDocument();

    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("saves the password, drops the marker and folds back to «Password set»", async () => {
    updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });
    signInAs({ passwordless: true });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ password: "secret12", data: { passwordless: false } });
      expect(screen.getByText("Password set")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("cancel is locked while saving", async () => {
    updateUserMock.mockReturnValue(new Promise(() => {}));
    signInAs({ passwordless: true });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
  });

  it("shows the server's refusal and keeps the fields open", async () => {
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "New password should be different from the old password." },
    });
    signInAs({});
    render(<SecurityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("New password should be different from the old password.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("a guest sees no password section", () => {
    __unsafeSetRuntimeAuthStateForTests({ status: "guest", session: null, user: null, profileId: null });
    render(<SecurityPanel />);
    expect(screen.queryByText("Password")).toBeNull();
  });
});
