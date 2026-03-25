import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/auth/Login";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";

const { signInWithPasswordMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("Login", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("sets simulated role to owner after successful sign in", async () => {
    setAuthRole("guest");
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { user: { id: "profile-1" } } },
      error: null,
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalled();
      expect(getAuthRole()).toBe("owner");
    });
  });
});
