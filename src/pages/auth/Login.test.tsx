import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Login from "@/pages/auth/Login";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";
import { toast } from "@/hooks/use-toast";

const { signInWithPasswordMock, signInWithOtpMock, verifyOtpMock, trackEventOncePerUserMock, invokeMock, aalMock, signInWithPasskeyMock } = vi.hoisted(() => ({
  aalMock: vi.fn(),
  signInWithPasskeyMock: vi.fn(),
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
      signInWithPasskey: signInWithPasskeyMock,
      mfa: { getAuthenticatorAssuranceLevel: aalMock },
    },
    functions: { invoke: invokeMock },
  },
}));

const { passkeysOnMock } = vi.hoisted(() => ({ passkeysOnMock: vi.fn() }));
vi.mock("@/lib/passkey-availability", () => ({ passkeysEnabledOnServer: () => passkeysOnMock() ?? Promise.resolve(false) }));

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

  it("a person with two-factor protection goes to the code from the app first, keeping next", async () => {
    setAuthRole("guest");
    aalMock.mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
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
      expect(screen.getByTestId("location-marker")).toHaveTextContent("/auth/mfa?next=%2Finvite%2Faccept%2Ftoken-123");
    });
    expect(trackEventOncePerUserMock).not.toHaveBeenCalledWith("first_login", expect.anything());
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

  describe("face or fingerprint (slice 5, frames 2-4)", () => {
    function stubWebAuthn({ conditional = false, platform = false } = {}) {
      const signalUnknownCredential = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("PublicKeyCredential", {
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(conditional),
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(platform),
        signalUnknownCredential,
      });
      return { signalUnknownCredential };
    }

    function renderLogin(url = "/auth/login?next=%2Fproject%2F7") {
      return render(
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/auth/login" element={<Login />} />
            <Route path="*" element={<LocationMarker />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    beforeEach(() => {
      passkeysOnMock.mockResolvedValue(true);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("Auth has it off (passkeys_enabled false): no button, no quiet request, no «Входите быстрее»", async () => {
      passkeysOnMock.mockResolvedValue(false);
      stubWebAuthn({ conditional: true, platform: true });
      localStorage.setItem("onboarding-complete:profile-1", "true");
      signInWithPasswordMock.mockResolvedValue({ data: { session: { user: { id: "profile-1" } } }, error: null });
      renderLogin();
      await waitFor(() => expect(passkeysOnMock).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Sign in with face or fingerprint" })).toBeNull();
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/project/7"));
      expect(signInWithPasskeyMock).not.toHaveBeenCalled();
    });

    it("no button in a browser without WebAuthn, and Auth is not even asked", () => {
      renderLogin();
      expect(screen.queryByRole("button", { name: "Sign in with face or fingerprint" })).toBeNull();
      expect(passkeysOnMock).not.toHaveBeenCalled();
    });

    it("the button sits under «code from email» and above Yandex ID and VK ID, in both views", async () => {
      stubWebAuthn();
      renderLogin();
      await screen.findByRole("button", { name: "Sign in with face or fingerprint" });
      const order = () => screen.getAllByRole("button").map((b) => b.textContent);
      const names = order();
      const passkeyAt = names.indexOf("Sign in with face or fingerprint");
      expect(passkeyAt).toBeGreaterThan(names.indexOf("Sign in with a code from email"));
      expect(passkeyAt).toBeLessThan(names.findIndex((n) => n?.includes("Yandex ID")));
      expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username webauthn");
      expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");

      fireEvent.click(screen.getByRole("button", { name: "Sign in with a code from email" }));
      expect(await screen.findByRole("button", { name: "Sign in with face or fingerprint" })).toBeInTheDocument();
      expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username webauthn");
    });

    it("signs in, waits with a spinner, goes to next and reports method passkey", async () => {
      stubWebAuthn();
      let finish: (value: unknown) => void = () => {};
      signInWithPasskeyMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      aalMock.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [{ method: "passkey", timestamp: 1 }] }, error: null });
      renderLogin();

      fireEvent.click(await screen.findByRole("button", { name: "Sign in with face or fingerprint" }));
      expect(await screen.findByRole("button", { name: "Waiting for confirmation…" })).toBeDisabled();
      const user = { id: "profile-1" };
      finish({ data: { session: { user }, user }, error: null });

      await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/project/7"));
      expect(trackEventOncePerUserMock).toHaveBeenCalledWith("first_login", expect.objectContaining({ method: "passkey" }));
    });

    it.each([
      [{ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" }, "Sign-in with face or fingerprint was not completed. Try again or sign in with a code from email."],
      [{ code: "webauthn_credential_not_found", status: 404 }, "This device has been turned off in your account. Sign in with your password or a code from email and set up face or fingerprint sign-in again in Security."],
      [{ code: "webauthn_verification_failed", status: 400 }, "Couldn't verify the face or fingerprint sign-in. Sign in with your password or a code from email, then turn this device off in Security and set it up again."],
    ])("a refusal %o is a plaque in the card", async (error, text) => {
      stubWebAuthn();
      signInWithPasskeyMock.mockResolvedValue({ data: null, error });
      renderLogin();
      fireEvent.click(await screen.findByRole("button", { name: "Sign in with face or fingerprint" }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in with face or fingerprint" })).toBeEnabled();
      expect(toast).not.toHaveBeenCalled();
    });

    it("asks quietly for the Email suggestion where the browser can, and drops it for the button and on leaving", async () => {
      stubWebAuthn({ conditional: true });
      const signals: AbortSignal[] = [];
      signInWithPasskeyMock.mockImplementation(({ options }: { options: { signal: AbortSignal; mediation?: string } }) => {
        signals.push(options.signal);
        return new Promise((resolve) => {
          options.signal.addEventListener("abort", () => resolve({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } }));
        });
      });
      const { unmount } = renderLogin();

      await waitFor(() => expect(signInWithPasskeyMock).toHaveBeenCalledTimes(1));
      expect(signInWithPasskeyMock.mock.calls[0][0].options.mediation).toBe("conditional");

      fireEvent.click(await screen.findByRole("button", { name: "Sign in with face or fingerprint" }));
      await waitFor(() => expect(signInWithPasskeyMock).toHaveBeenCalledTimes(2));
      expect(signals[0].aborted).toBe(true);
      expect(signInWithPasskeyMock.mock.calls[1][0].options.mediation).toBeUndefined();

      unmount();
      expect(signals[1].aborted).toBe(true);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("after a password sign-in on a device with a fingerprint: «Входите быстрее» before next", async () => {
      stubWebAuthn({ platform: true });
      localStorage.setItem("onboarding-complete:profile-1", "true");
      signInWithPasswordMock.mockResolvedValue({ data: { session: { user: { id: "profile-1" } } }, error: null });
      renderLogin();
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/auth/faster?next=%2Fproject%2F7"));
    });

    it("no «Входите быстрее» after a sign-in by face, for an invitation, or before onboarding", async () => {
      stubWebAuthn({ platform: true });
      signInWithPasswordMock.mockResolvedValue({ data: { session: { user: { id: "profile-1" } } }, error: null });
      const { unmount } = renderLogin("/auth/login");
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/onboarding"));
      unmount();

      localStorage.setItem("onboarding-complete:profile-1", "true");
      const second = renderLogin("/auth/login?next=%2Finvite%2Faccept%2Ft1");
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/invite/accept/t1"));
      second.unmount();

      const user = { id: "profile-1" };
      signInWithPasskeyMock.mockResolvedValue({ data: { session: { user }, user }, error: null });
      renderLogin();
      fireEvent.click(await screen.findByRole("button", { name: "Sign in with face or fingerprint" }));
      await waitFor(() => expect(screen.getByTestId("location-marker")).toHaveTextContent("/project/7"));
    });
  });
});
