import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Signup from "@/pages/auth/Signup";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";

const { signInWithOtpMock, verifyOtpMock, signUpMock, trackEventMock, trackEventOncePerUserMock } = vi.hoisted(() => ({
  signInWithOtpMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  signUpMock: vi.fn(),
  trackEventMock: vi.fn(),
  trackEventOncePerUserMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
      signUp: signUpMock,
    },
  },
}));

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackEvent: trackEventMock,
  trackEventOncePerUser: trackEventOncePerUserMock,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

const { secondStepMock } = vi.hoisted(() => ({ secondStepMock: vi.fn() }));
vi.mock("@/lib/mfa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mfa")>()),
  isSecondStepRequired: secondStepMock,
}));

function newUserSession(id = "profile-1") {
  return {
    user: {
      id,
      created_at: "2026-10-28T10:00:00Z",
      email_confirmed_at: "2026-10-29T15:00:00Z",
      last_sign_in_at: "2026-10-29T15:00:01Z",
      user_metadata: { full_name: "Jane Owner", passwordless: true },
    },
  };
}

describe("Signup", () => {
  function LocationMarker() {
    const location = useLocation();
    return <div data-testid="location-marker">{`${location.pathname}${location.search}`}</div>;
  }

  function renderSignup(initialEntry = "/auth/signup") {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/signup" element={<Signup />} />
          <Route path="*" element={<LocationMarker />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function requestCode(email = "owner@example.com") {
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: " Jane Owner " } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Get code" }));
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    secondStepMock.mockResolvedValue(false);
  });

  it("has no password fields and names the button in the consent", () => {
    renderSignup();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText("Confirm password")).toBeNull();
    expect(screen.getByRole("button", { name: "Get code" })).toBeInTheDocument();
    expect(screen.getByText(/By clicking “Get code”, “Yandex\sID” or “VK\sID”/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Yandex ID" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with VK ID" })).toBeInTheDocument();
  });

  it("asks for a sign-up code that creates a passwordless account", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    renderSignup();
    requestCode();

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith({
        email: "owner@example.com",
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { full_name: "Jane Owner", passwordless: true },
        },
      });
    });
    expect(signUpMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("the code signs a new person in, reports email_code and opens onboarding", async () => {
    setAuthRole("guest");
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    verifyOtpMock.mockResolvedValue({ data: { session: newUserSession() }, error: null });
    renderSignup();
    requestCode();

    fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({ email: "owner@example.com", token: "482913", type: "email" });
      expect(screen.getByTestId("location-marker")).toHaveTextContent(/^\/onboarding$/);
    });
    expect(getAuthRole()).toBe("owner");
    expect(trackEventOncePerUserMock).toHaveBeenCalledWith(
      "registration_complete",
      expect.objectContaining({ user_id: "profile-1", method: "email_code", email_confirmation_required: false }),
    );
    expect(trackEventOncePerUserMock).toHaveBeenCalledWith(
      "first_login",
      expect.objectContaining({ user_id: "profile-1", via: "signup_autologin", method: "email_code" }),
    );
  });

  it("the letter button of an invited person keeps the invite as next", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    renderSignup("/auth/signup?next=/invite/accept/token-123");
    requestCode();
    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Finvite%2Faccept%2Ftoken-123`,
          }),
        }),
      );
    });
  });

  it("an invited person lands on the invite after the code", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    verifyOtpMock.mockResolvedValue({ data: { session: newUserSession() }, error: null });
    renderSignup("/auth/signup?next=/invite/accept/token-123");
    requestCode();

    fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });

    await waitFor(() => {
      expect(screen.getByTestId("location-marker")).toHaveTextContent("/invite/accept/token-123");
    });
  });

  it("a taken email gets the same code screen and signs in without a registration event", async () => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    verifyOtpMock.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "existing",
            created_at: "2026-01-10T10:00:00Z",
            email_confirmed_at: "2026-01-10T10:05:00Z",
            last_sign_in_at: "2026-10-29T15:00:01Z",
            user_metadata: {},
          },
        },
      },
      error: null,
    });
    renderSignup();
    requestCode("taken@example.com");

    fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });

    await waitFor(() => {
      expect(screen.getByTestId("location-marker").textContent).toMatch(/^\/(home|onboarding)$/);
    });
    expect(trackEventOncePerUserMock).not.toHaveBeenCalledWith("registration_complete", expect.anything());
  });

  it("a taken email of a protected account passes the code from the app first", async () => {
    secondStepMock.mockResolvedValue(true);
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    verifyOtpMock.mockResolvedValue({
      data: { session: { user: { id: "existing", created_at: "2026-01-10T10:00:00Z", email_confirmed_at: "2026-01-10T10:05:00Z", last_sign_in_at: "2026-10-29T15:00:01Z", user_metadata: {} } } },
      error: null,
    });
    renderSignup();
    requestCode("taken@example.com");
    fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });
    await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/auth/mfa?next=%2Fhome"));
  });

  it("does not ask for a code without a name", async () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get code" }));
    await waitFor(() => {
      expect(signInWithOtpMock).not.toHaveBeenCalled();
    });
  });

  it.each(["//evil.example", "/\\evil.example", "/.//evil.example"])("ignores an off-origin next param %s after signup", async (next) => {
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
    verifyOtpMock.mockResolvedValue({ data: { session: newUserSession() }, error: null });
    renderSignup(`/auth/signup?next=${encodeURIComponent(next)}`);
    requestCode();

    fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });

    await waitFor(() => {
      expect(screen.getByTestId("location-marker")).toHaveTextContent(/^\/onboarding$/);
    });
  });

  it("forwards a same-origin next param to the sign-in link and drops an off-origin one", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/auth/signup?next=%2Finvite%2Faccept%2Ftoken-123"]}>
        <Routes>
          <Route path="/auth/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/login?next=%2Finvite%2Faccept%2Ftoken-123",
    );
    unmount();

    render(
      <MemoryRouter initialEntries={["/auth/signup?next=%2F%2Fevil.example"]}>
        <Routes>
          <Route path="/auth/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login");
  });
});
