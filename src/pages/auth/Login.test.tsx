import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as authState from "@/lib/auth-state";
import Login from "@/pages/auth/Login";

const signInWithPassword = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword,
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

function renderLogin() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/auth/login"]}>
        <Routes>
          <Route path="/auth/login" element={<Login />} />
          <Route path="/home" element={<div>Home</div>} />
          <Route path="/onboarding" element={<div>Onboarding</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Login", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    signInWithPassword.mockReset();
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("calls Supabase sign-in and does not persist simulated local auth", async () => {
    signInWithPassword.mockResolvedValue({
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

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "secret-123",
      });
    });
    expect(setProfileSpy).not.toHaveBeenCalled();
    expect(setRoleSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
  });
});
