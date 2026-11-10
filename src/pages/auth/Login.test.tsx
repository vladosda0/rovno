import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Login from "@/pages/auth/Login";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";
import { toast } from "@/hooks/use-toast";

const { signInWithPasswordMock, signInWithOtpMock, verifyOtpMock, trackEventOncePerUserMock, invokeMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  trackEventOncePerUserMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
    },
    functions: { invoke: invokeMock },
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

  describe("Yandex ID", () => {
    function renderAt(url: string) {
      render(
        <MemoryRouter initialEntries={[url]}>
          <Login />
          <LocationMarker />
        </MemoryRouter>,
      );
    }

    it("shows Yandex ID and VK ID in one row and the consent in both the password and the code view", () => {
      renderAt("/auth/login");
      const yandex = screen.getByRole("button", { name: "Sign in with Yandex ID" });
      const vk = screen.getByRole("button", { name: "Sign in with VK ID" });
      expect(yandex).toHaveTextContent(/^Yandex ID$/);
      expect(vk).toHaveTextContent(/^VK ID$/);
      expect(yandex.parentElement).toBe(vk.parentElement);
      expect(screen.queryByText(/Sign in with$/)).toBeNull();
      expect(screen.getByText(/By signing in with Yandex\sID or VK\sID for the first time/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Sign in with a code from email" }));
      expect(screen.getByRole("button", { name: "Sign in with Yandex ID" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in with VK ID" })).toBeInTheDocument();
      expect(screen.getByText(/By signing in with Yandex\sID or VK\sID for the first time/)).toBeInTheDocument();
    });

    it("VK ID starts its own attempt with next and turns busy", async () => {
      invokeMock.mockReturnValue(new Promise(() => undefined));
      renderAt("/auth/login?next=%2Finvite%2Faccept%2Fabc");
      fireEvent.click(screen.getByRole("button", { name: "Sign in with VK ID" }));
      await waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith("vk-auth", {
          body: { action: "start", mode: "login", next: "/invite/accept/abc" },
        }),
      );
      expect(screen.getByRole("button", { name: "Sign in with VK ID" })).toBeDisabled();
      // One attempt at a time: the other provider waits too.
      expect(screen.getByRole("button", { name: "Sign in with Yandex ID" })).toBeDisabled();
    });

    it("shows the VK plaque once", async () => {
      renderAt("/auth/login?vk=failed&next=%2Fhome");
      expect(screen.getByRole("alert")).toHaveTextContent("VK ID sign-in wasn't completed. Try again or sign in with a code from email.");
      await waitFor(() => expect(screen.getByTestId("location-marker").textContent).toBe("/auth/login?next=%2Fhome"));
    });

    it("carries next into the attempt", async () => {
      invokeMock.mockResolvedValue({ data: { outcome: "failed" }, error: null });
      renderAt("/auth/login?next=%2Finvite%2Faccept%2Fabc");
      fireEvent.click(screen.getByRole("button", { name: "Sign in with Yandex ID" }));
      await waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith("yandex-auth", {
          body: { action: "start", mode: "login", next: "/invite/accept/abc" },
        }),
      );
    });

    it("says so when the attempt cannot start", async () => {
      invokeMock.mockResolvedValue({ data: null, error: new Error("offline") });
      renderAt("/auth/login");
      fireEvent.click(screen.getByRole("button", { name: "Sign in with Yandex ID" }));
      await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
      expect(screen.getByRole("button", { name: "Sign in with Yandex ID" })).toBeEnabled();
    });

    it("shows the plaque once and clears the address, so a refresh forgets it", async () => {
      renderAt("/auth/login?yandex=failed&next=%2Fhome");
      expect(screen.getByRole("alert")).toHaveTextContent("Yandex sign-in wasn't completed");
      await waitFor(() => expect(screen.getByTestId("location-marker").textContent).toBe("/auth/login?next=%2Fhome"));
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("the plaque goes away with the next action", () => {
      renderAt("/auth/login?yandex=failed");
      fireEvent.click(screen.getByRole("button", { name: "Sign in with a code from email" }));
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
