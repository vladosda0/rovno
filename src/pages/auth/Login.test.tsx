import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Login from "@/pages/auth/Login";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";
import { toast } from "@/hooks/use-toast";

const { signInWithPasswordMock, signInWithOtpMock, verifyOtpMock, trackEventOncePerUserMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  trackEventOncePerUserMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
    },
  },
}));

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackEventOncePerUser: trackEventOncePerUserMock,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("Login", () => {
  function LocationMarker() {
    const location = useLocation();
    return <div data-testid="location-marker">{`${location.pathname}${location.search}`}</div>;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("preserves the simulated role after successful sign in", async () => {
    setAuthRole("contractor");
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
      expect(getAuthRole()).toBe("contractor");
    });
  });

  it("keeps a safe next on the create-account link and drops an unsafe one", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/auth/login?next=%2Finvite%2Faccept%3Ftoken%3Dabc"]}>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/auth/signup?next=%2Finvite%2Faccept%3Ftoken%3Dabc",
    );
    unmount();

    render(
      <MemoryRouter initialEntries={["/auth/login?next=https%3A%2F%2Fevil.example"]}>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/auth/signup");
  });

  it("redirects to next param after successful sign in", async () => {
    setAuthRole("guest");
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { user: { id: "profile-1" } } },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/auth/login?next=/invite/accept/token-123"]}>
        <Routes>
          <Route path="/auth/login" element={<Login />} />
          <Route path="*" element={<LocationMarker />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-marker")).toHaveTextContent("/invite/accept/token-123");
    });
  });

  it.each(["//evil.example", "/\\evil.example", "/.//evil.example"])("ignores an off-origin next param %s after sign in", async (next) => {
    setAuthRole("guest");
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { user: { id: "profile-1" } } },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={[`/auth/login?next=${encodeURIComponent(next)}`]}>
        <Routes>
          <Route path="/auth/login" element={<Login />} />
          <Route path="*" element={<LocationMarker />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-marker").textContent).toMatch(/^\/(home|onboarding)$/);
    });
  });

  it("password field has no placeholder dots", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("placeholder");
  });

  it("password sign in reports method password", async () => {
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
      expect(trackEventOncePerUserMock).toHaveBeenCalledWith(
        "first_login",
        expect.objectContaining({ via: "login", method: "password" }),
      );
    });
  });

  describe("code from email", () => {
    function openCodeMode(initialEntry = "/auth/login") {
      render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/auth/login" element={<Login />} />
            <Route path="*" element={<LocationMarker />} />
          </Routes>
        </MemoryRouter>,
      );
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: " ivan@mail.ru " } });
      fireEvent.click(screen.getByRole("button", { name: "Sign in with a code from email" }));
    }

    it("switches to the code form and back, keeping the email", () => {
      openCodeMode();
      expect(screen.queryByLabelText("Password")).toBeNull();
      expect(screen.getByRole("button", { name: "Get code" })).toBeInTheDocument();
      expect(screen.getByLabelText("Email")).toHaveValue("ivan@mail.ru");

      fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    });

    it("asks for a code without creating an account", async () => {
      signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
      openCodeMode();
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));

      await waitFor(() => {
        expect(signInWithOtpMock).toHaveBeenCalledWith({
          email: "ivan@mail.ru",
          options: { shouldCreateUser: false },
        });
      });
      expect(await screen.findByText("Check your email")).toBeInTheDocument();
    });

    it("an unknown email (422) shows the very same code screen", async () => {
      signInWithOtpMock.mockResolvedValue({
        data: {},
        error: { status: 422, code: "otp_disabled", message: "Signups not allowed for otp" },
      });
      openCodeMode();
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));

      expect(await screen.findByText("Check your email")).toBeInTheDocument();
      expect(screen.getByText("We sent a code to ivan@mail.ru. It usually arrives within a minute.")).toBeInTheDocument();
    });

    it("a too-early resend for an existing account (429) also shows the code screen, no toast", async () => {
      signInWithOtpMock.mockResolvedValue({
        data: {},
        error: { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 58 seconds." },
      });
      openCodeMode();
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));

      expect(await screen.findByText("Check your email")).toBeInTheDocument();
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it("the server-wide email limit (same 429 code) is a visible failure", async () => {
      signInWithOtpMock.mockResolvedValue({
        data: {},
        error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
      });
      openCodeMode();
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
      });
      expect(screen.queryByText("Check your email")).toBeNull();
    });

    it("another 422 is a real failure, not a sent code", async () => {
      signInWithOtpMock.mockResolvedValue({
        data: {},
        error: { status: 422, code: "email_provider_disabled", message: "Email logins are disabled" },
      });
      openCodeMode();
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
      });
      expect(screen.queryByText("Check your email")).toBeNull();
    });

    it("the sixth digit signs in, reports method email_code and follows a safe next", async () => {
      setAuthRole("guest");
      signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
      verifyOtpMock.mockResolvedValue({ data: { session: { user: { id: "profile-1" } } }, error: null });
      openCodeMode("/auth/login?next=/invite/accept/token-123");
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));

      fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482 913" } });

      await waitFor(() => {
        expect(verifyOtpMock).toHaveBeenCalledWith({ email: "ivan@mail.ru", token: "482913", type: "email" });
        expect(screen.getByTestId("location-marker")).toHaveTextContent("/invite/accept/token-123");
      });
      expect(getAuthRole()).toBe("owner");
      expect(trackEventOncePerUserMock).toHaveBeenCalledWith(
        "first_login",
        expect.objectContaining({ via: "login", method: "email_code" }),
      );
    });

    it("change email returns to the code form", async () => {
      signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
      openCodeMode();
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));
      fireEvent.click(await screen.findByRole("button", { name: "Change email" }));
      expect(screen.getByRole("button", { name: "Get code" })).toBeInTheDocument();
    });
  });
});
