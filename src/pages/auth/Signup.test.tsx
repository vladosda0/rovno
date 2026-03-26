import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Signup from "@/pages/auth/Signup";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";

const { signUpMock } = vi.hoisted(() => ({
  signUpMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: signUpMock,
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("Signup", () => {
  function LocationMarker() {
    const location = useLocation();
    return <div data-testid="location-marker">{`${location.pathname}${location.search}`}</div>;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("sets simulated role to owner when signup creates an immediate session", async () => {
    setAuthRole("guest");
    signUpMock.mockResolvedValue({
      data: { session: { user: { id: "profile-1" } } },
      error: null,
    });

    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane Owner" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalled();
      expect(getAuthRole()).toBe("owner");
    });
  });

  it("redirects to next param when signup creates immediate session", async () => {
    setAuthRole("guest");
    signUpMock.mockResolvedValue({
      data: { session: { user: { id: "profile-1" } } },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/auth/signup?next=/invite/accept/token-123"]}>
        <Routes>
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="*" element={<LocationMarker />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane Owner" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-marker")).toHaveTextContent("/invite/accept/token-123");
    });
  });
});
