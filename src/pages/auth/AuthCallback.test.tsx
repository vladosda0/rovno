import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AuthCallback from "@/pages/auth/AuthCallback";

const { getSessionMock, signOutMock, trackEventOncePerUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  trackEventOncePerUserMock: vi.fn(),
}));

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackEventOncePerUser: trackEventOncePerUserMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock, signOut: signOutMock } },
}));

const { secondStepMock } = vi.hoisted(() => ({ secondStepMock: vi.fn() }));
vi.mock("@/lib/mfa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mfa")>()),
  isSecondStepRequired: secondStepMock,
}));

function LocationMarker() {
  const location = useLocation();
  return <div data-testid="location-marker">{`${location.pathname}${location.search}`}</div>;
}

function renderCallback(entry = "/auth/callback") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<LocationMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthCallback", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ error: null });
    secondStepMock.mockResolvedValue(false);
  });

  it("a protected account passes the code from the app before anything is read", async () => {
    secondStepMock.mockResolvedValue(true);
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "u2", user_metadata: { passwordless: true } } } } });
    renderCallback("/auth/callback?next=%2Finvite%2Faccept%2Fa");
    await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/auth/mfa?next=%2Finvite%2Faccept%2Fa"));
  });

  it("a just-confirmed password account is signed out and asked to sign in", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "u1", email_confirmed_at: "2026-10-29T15:00:00Z", last_sign_in_at: "2026-10-29T15:00:01Z", user_metadata: {} },
        },
      },
    });
    renderCallback();
    await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/auth/login?confirmed=1"));
    expect(signOutMock).toHaveBeenCalled();
  });

  it("a passwordless account (sign-up letter button) stays signed in", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "u2", user_metadata: { passwordless: true } } } } });
    renderCallback();
    await waitFor(() => expect(screen.getByTestId("location-marker").textContent).toMatch(/^\/(home|onboarding)$/));
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("the button of a just-registered person counts the registration and keeps a safe next", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "u3",
            email_confirmed_at: "2026-10-29T15:00:00Z",
            last_sign_in_at: "2026-10-29T15:00:01Z",
            user_metadata: { passwordless: true },
          },
        },
      },
    });
    renderCallback("/auth/callback?next=%2Finvite%2Faccept%2Ftoken-123");
    await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/invite/accept/token-123"));
    expect(trackEventOncePerUserMock).toHaveBeenCalledWith(
      "registration_complete",
      expect.objectContaining({ user_id: "u3", method: "email_code" }),
    );
  });

  it("an unsafe next is ignored", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "u4", user_metadata: { passwordless: true } } } } });
    renderCallback("/auth/callback?next=%2F%2Fevil.example");
    await waitFor(() => expect(screen.getByTestId("location-marker").textContent).toMatch(/^\/(home|onboarding)$/));
  });

  it("an existing password account using the sign-in letter button stays signed in", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "u5", email_confirmed_at: "2026-01-10T10:00:00Z", last_sign_in_at: "2026-10-29T15:00:01Z", user_metadata: {} },
        },
      },
    });
    renderCallback();
    await waitFor(() => expect(screen.getByTestId("location-marker").textContent).toMatch(/^\/(home|onboarding)$/));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(trackEventOncePerUserMock).not.toHaveBeenCalledWith("registration_complete", expect.anything());
  });

  it("an expired or invalid link (no session) signs out and goes to the sign-in form", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    renderCallback();
    await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/auth/login?confirmed=1"));
    expect(signOutMock).toHaveBeenCalled();
  });
});
