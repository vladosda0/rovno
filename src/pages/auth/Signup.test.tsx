import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as authState from "@/lib/auth-state";
import Signup from "@/pages/auth/Signup";

const signUp = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp,
    },
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderSignup() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/auth/signup"]}>
        <Routes>
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="/auth/login" element={<div>Login</div>} />
          <Route path="/onboarding" element={<div>Onboarding</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillSignupForm() {
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Owner User" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-123" } });
}

describe("Signup", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    signUp.mockReset();
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("calls Supabase sign-up with full_name metadata and does not persist simulated auth", async () => {
    signUp.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "profile-1",
          },
        },
      },
      error: null,
    });

    const setProfileSpy = vi.spyOn(authState, "setStoredLocalAuthProfile");
    const setRoleSpy = vi.spyOn(authState, "setSimulatedAuthRole");

    renderSignup();
    fillSignupForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "secret-123",
        options: {
          data: {
            full_name: "Owner User",
          },
        },
      });
    });
    expect(setProfileSpy).not.toHaveBeenCalled();
    expect(setRoleSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
  });

  it("redirects to login when email confirmation is required", async () => {
    signUp.mockResolvedValue({
      data: {
        session: null,
        user: {
          id: "profile-1",
        },
      },
      error: null,
    });

    renderSignup();
    fillSignupForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalled();
    });
    expect(await screen.findByText("Login")).toBeInTheDocument();
  });
});
