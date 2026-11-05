import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import YandexCallback from "@/pages/auth/YandexCallback";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  setSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  trackEventOncePerUser: vi.fn(),
  hasCompletedOnboarding: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: {
      setSession: mocks.setSession,
      signInWithPassword: mocks.signInWithPassword,
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
    },
  },
}));

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackEventOncePerUser: mocks.trackEventOncePerUser,
}));

vi.mock("@/lib/auth-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-state")>()),
  hasCompletedOnboarding: mocks.hasCompletedOnboarding,
}));

vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const USER = { id: "u1", email: "ivan@yandex.ru" };
const SESSION = { access_token: "at", refresh_token: "rt" };
const VERIFY = { token_hash: "th1", type: "magiclink" };

function Marker() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderCallback(url = "/auth/yandex/callback?code=c1&state=s1") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/yandex/callback" element={<YandexCallback />} />
        <Route path="*" element={<Marker />} />
      </Routes>
    </MemoryRouter>,
  );
}

function startedAttempt(mode: "login" | "link" = "login", next: string | null = null) {
  sessionStorage.setItem("rovno.yandex-login-attempt", JSON.stringify({ state: "s1", mode, next }));
}

const location = () => screen.findByTestId("location");

describe("YandexCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.setSession.mockResolvedValue({ data: { user: USER }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: USER, session: { user: USER } }, error: null });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.hasCompletedOnboarding.mockResolvedValue(true);
  });

  it("does not spend the code when this browser did not start the attempt", async () => {
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("does not spend the code when the state differs", async () => {
    sessionStorage.setItem("rovno.yandex-login-attempt", JSON.stringify({ state: "other", mode: "login", next: null }));
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("a refusal at Yandex returns to the login page with next kept", async () => {
    startedAttempt("login", "/invite/accept/abc");
    renderCallback("/auth/yandex/callback?error=access_denied&state=s1");
    expect((await location()).textContent).toBe("/auth/login?yandex=failed&next=%2Finvite%2Faccept%2Fabc");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("a new person lands on onboarding and registers with method yandex", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({
      data: { outcome: "verify", verify: { token_hash: "th1", type: "signup" }, created: true, next: null },
      error: null,
    });
    renderCallback();
    expect((await location()).textContent).toBe("/onboarding");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("yandex-auth", { body: { action: "callback", code: "c1", state: "s1" } });
    // The browser spends the token itself, so Auth counts the check against its own address.
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "th1", type: "signup" });
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.trackEventOncePerUser).toHaveBeenCalledWith(
      "registration_complete",
      expect.objectContaining({ method: "yandex", user_id: "u1" }),
    );
  });

  it("a returning person goes home", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/home");
  });

  it("the function's next wins over the attempt's", async () => {
    startedAttempt("login", "/invite/accept/from-attempt");
    mocks.invoke.mockResolvedValue({
      data: { outcome: "verify", verify: VERIFY, created: false, next: "/invite/accept/from-function" },
      error: null,
    });
    renderCallback();
    expect((await location()).textContent).toBe("/invite/accept/from-function");
  });

  it("the attempt's next stands in when the function has none", async () => {
    startedAttempt("login", "/invite/accept/from-attempt");
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/invite/accept/from-attempt");
  });

  it("takes the code out of the address bar", async () => {
    startedAttempt();
    window.history.replaceState(null, "", "/auth/yandex/callback?code=c1&state=s1");
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    renderCallback();
    await location();
    expect(window.location.search).toBe("");
  });

  it("drops a foreign next from the function", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({
      data: { outcome: "verify", verify: VERIFY, created: false, next: "https://evil.example/" },
      error: null,
    });
    renderCallback();
    expect((await location()).textContent).toBe("/home");
  });

  it("a function still answering with a session signs in with it", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "session", session: SESSION, created: false, next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/home");
    expect(mocks.setSession).toHaveBeenCalledWith(SESSION);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("a refused token shows the plaque", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: Object.assign(new Error("Too many"), { status: 429 }) });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "th1", type: "magiclink" });
  });

  it("a token that yields no session shows the plaque", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: USER, session: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
  });

  it("a verify answer without a token shows the plaque", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", created: false, next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("an empty token is not spent", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({
      data: { outcome: "verify", verify: { token_hash: "", type: "magiclink" }, created: false, next: null },
      error: null,
    });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("a throwing verifyOtp shows the plaque", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    mocks.verifyOtp.mockRejectedValue(new Error("listener threw"));
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
  });

  it("a session the client refuses shows the plaque", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "session", session: SESSION, created: false, next: null }, error: null });
    mocks.setSession.mockResolvedValue({ data: { user: USER }, error: new Error("x") });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
  });

  it("a token of an unknown type is not spent", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({
      data: { outcome: "verify", verify: { token_hash: "th1", type: "recovery" }, created: false, next: null },
      error: null,
    });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("a failed exchange shows the plaque", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "failed", reason: "provider" }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("a network failure shows the plaque too", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("offline") });
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?yandex=failed");
  });

  it("linking returns to Security with the result", async () => {
    startedAttempt("link");
    mocks.invoke.mockResolvedValue({ data: { outcome: "linked", next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/settings?tab=security&yandex=linked");
  });

  it("an account with another Yandex comes back with its own notice", async () => {
    startedAttempt("link");
    mocks.invoke.mockResolvedValue({ data: { outcome: "has_yandex" }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/settings?tab=security&yandex=has_yandex");
  });

  it("a Yandex account of someone else comes back as taken", async () => {
    startedAttempt("link");
    mocks.invoke.mockResolvedValue({ data: { outcome: "taken" }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/settings?tab=security&yandex=taken");
  });

  describe("account already exists", () => {
    const proof = (kind: string) => ({
      data: { outcome: "proof", token: "t1", kind, email: "ivan@yandex.ru", name: "Иван", next: null },
      error: null,
    });

    it("asks for the password and opens nothing before it", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValue(proof("password"));
      renderCallback();
      expect(await screen.findByText("Account already exists")).toBeInTheDocument();
      expect(screen.getByText(/An account with ivan@yandex.ru already exists. Enter its password/)).toBeInTheDocument();
      expect(mocks.setSession).not.toHaveBeenCalled();
      expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    });

    it("a right password signs in, links and goes in", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("password"));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
      mocks.signInWithPassword.mockResolvedValue({ data: { session: { user: USER } }, error: null });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret1" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect((await location()).textContent).toBe("/home");
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ivan@yandex.ru", password: "secret1" });
      expect(mocks.invoke).toHaveBeenLastCalledWith("yandex-auth", { body: { action: "confirm", token: "t1" } });
    });

    it("a wrong password stays on the screen and links nothing", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("password"));
      mocks.signInWithPassword.mockResolvedValue({ data: { session: null }, error: Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }) });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "wrong" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByText(/That password didn't work/)).toBeInTheDocument();
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
    });

    it("forgot password switches to a code for this account only", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValue(proof("password"));
      renderCallback();
      fireEvent.click(await screen.findByRole("button", { name: "Forgot password? Get a code by email" }));
      expect(await screen.findByText(/Enter the code from the email/)).toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.signInWithOtp).toHaveBeenCalledWith({
          email: "ivan@yandex.ru",
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
        }),
      );
      expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("a passwordless account gets the code at once, and the code links", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("code"));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
      mocks.verifyOtp.mockResolvedValue({ data: { session: { user: USER } }, error: null });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });
      expect((await location()).textContent).toBe("/home");
      expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
      expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "ivan@yandex.ru", token: "482913", type: "email" });
    });

    it("a new outside address registers with the Yandex name after the code", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("new_email"));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
      mocks.verifyOtp.mockResolvedValue({ data: { session: { user: USER } }, error: null });
      renderCallback();
      expect(await screen.findByText("Check your email")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
      await waitFor(() =>
        expect(mocks.signInWithOtp).toHaveBeenCalledWith({
          email: "ivan@yandex.ru",
          options: expect.objectContaining({ shouldCreateUser: true, data: { full_name: "Иван", passwordless: true } }),
        }),
      );
      fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "482913" } });
      expect((await location()).textContent).toBe("/onboarding");
      expect(mocks.trackEventOncePerUser).toHaveBeenCalledWith(
        "registration_complete",
        expect.objectContaining({ method: "yandex" }),
      );
    });

    it("cancel returns to the login page", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValue(proof("password"));
      renderCallback();
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      expect((await location()).textContent).toBe("/auth/login");
    });

    it("cancel keeps the way back to the invite", async () => {
      startedAttempt("login", "/invite/accept/abc");
      mocks.invoke.mockResolvedValue(proof("password"));
      renderCallback();
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      expect((await location()).textContent).toBe("/auth/login?next=%2Finvite%2Faccept%2Fabc");
    });

    it("a proven person goes on to the invite", async () => {
      startedAttempt("login", "/invite/accept/abc");
      mocks.invoke.mockResolvedValueOnce(proof("password"));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
      mocks.signInWithPassword.mockResolvedValue({ data: { session: { user: USER } }, error: null });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret1" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect((await location()).textContent).toBe("/invite/accept/abc");
    });

    it("an outside address can leave the code screen", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValue(proof("new_email"));
      mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
      renderCallback();
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      expect((await location()).textContent).toBe("/auth/login");
    });

    it("the letter to an outside address leads back through the callback with next", async () => {
      startedAttempt("login", "/invite/accept/abc");
      mocks.invoke.mockResolvedValue(proof("new_email"));
      mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
      renderCallback();
      await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalled());
      expect(mocks.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
        `${window.location.origin}/auth/callback?next=%2Finvite%2Faccept%2Fabc`,
      );
    });

    it("a rate limit is not reported as a wrong password", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValue(proof("password"));
      mocks.signInWithPassword.mockResolvedValue({ data: { session: null }, error: Object.assign(new Error("Too many"), { code: "over_request_rate_limit" }) });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret1" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Too many" })));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("another Yandex on the account is named after the proof", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("password"));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "has_yandex" }, error: null });
      mocks.signInWithPassword.mockResolvedValue({ data: { session: { user: USER } }, error: null });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret1" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await location();
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Another Yandex ID is already linked to this account. Unlink it in Settings and try again.",
        variant: "destructive",
      }));
    });

    it("a failed link still lets the signed-in person in, with a message", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("password"));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "failed", reason: "expired" }, error: null });
      mocks.signInWithPassword.mockResolvedValue({ data: { session: { user: USER } }, error: null });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret1" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect((await location()).textContent).toBe("/home");
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    });
  });
});
