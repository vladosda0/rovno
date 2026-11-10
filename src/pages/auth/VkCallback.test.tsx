import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import VkCallback from "@/pages/auth/VkCallback";

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

const USER = { id: "u1", email: "ivan@mail.ru" };
const VERIFY = { token_hash: "th1", type: "magiclink" };
const CALLBACK = "/auth/vk/callback?code=c1&state=s1&device_id=d1&type=code_v2";

function Marker() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderCallback(url = CALLBACK) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/vk/callback" element={<VkCallback />} />
        <Route path="*" element={<Marker />} />
      </Routes>
    </MemoryRouter>,
  );
}

function startedAttempt(mode: "login" | "link" = "login", next: string | null = null) {
  sessionStorage.setItem("rovno.vk-login-attempt", JSON.stringify({ state: "s1", mode, next }));
}

const proof = (kind: string, email: string | null = "ivan@mail.ru") => ({
  data: { outcome: "proof", token: "t1", kind, email, name: "Иван Петров", next: null },
  error: null,
});

const location = () => screen.findByTestId("location");

describe("VkCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.verifyOtp.mockResolvedValue({ data: { user: USER, session: { user: USER } }, error: null });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.hasCompletedOnboarding.mockResolvedValue(true);
  });

  it("shows «Signing in with VK ID» while it checks", async () => {
    startedAttempt();
    mocks.invoke.mockReturnValue(new Promise(() => undefined));
    renderCallback();
    expect(await screen.findByText("Signing in with VK ID")).toBeInTheDocument();
  });

  it("does not spend the code when this browser did not start the attempt", async () => {
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?vk=failed");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("a Yandex attempt does not finish at VK", async () => {
    sessionStorage.setItem("rovno.yandex-login-attempt", JSON.stringify({ state: "s1", mode: "login", next: null }));
    renderCallback();
    expect((await location()).textContent).toBe("/auth/login?vk=failed");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("a return without device_id is not exchanged", async () => {
    startedAttempt();
    renderCallback("/auth/vk/callback?code=c1&state=s1");
    expect((await location()).textContent).toBe("/auth/login?vk=failed");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("a refusal at VK returns to the login page with next kept", async () => {
    startedAttempt("login", "/invite/accept/abc");
    renderCallback("/auth/vk/callback?error=access_denied&state=s1");
    expect((await location()).textContent).toBe("/auth/login?vk=failed&next=%2Finvite%2Faccept%2Fabc");
  });

  it("passes the code, the state and the device id to vk-auth, and a linked person goes home", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/home");
    expect(mocks.invoke).toHaveBeenCalledWith("vk-auth", {
      body: { action: "callback", code: "c1", state: "s1", device_id: "d1" },
    });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "th1", type: "magiclink" });
  });

  it("takes the code and the device id out of the address bar", async () => {
    startedAttempt();
    window.history.replaceState(null, "", CALLBACK);
    mocks.invoke.mockResolvedValue({ data: { outcome: "verify", verify: VERIFY, created: false, next: null }, error: null });
    renderCallback();
    await location();
    expect(window.location.search).toBe("");
  });

  it("a new person with a VK email confirms it with a code and registers with method vk", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValueOnce(proof("new_email"));
    mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
    renderCallback();
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        email: "ivan@mail.ru",
        options: expect.objectContaining({ shouldCreateUser: true, data: { full_name: "Иван Петров", passwordless: true } }),
      }),
    );
    fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "482913" } });
    expect((await location()).textContent).toBe("/onboarding");
    expect(mocks.invoke).toHaveBeenLastCalledWith("vk-auth", { body: { action: "confirm", token: "t1" } });
    expect(mocks.trackEventOncePerUser).toHaveBeenCalledWith("registration_complete", expect.objectContaining({ method: "vk" }));
  });

  describe("VK gave no email", () => {
    it("asks for one, sends the code to it and registers the person after the code", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("need_email", null));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
      const now = new Date().toISOString();
      mocks.verifyOtp.mockResolvedValue({
        data: { session: { user: { ...USER, email: "new@mail.ru", email_confirmed_at: now, last_sign_in_at: now } } },
        error: null,
      });
      renderCallback();
      expect(await screen.findByText("Enter your email")).toBeInTheDocument();
      expect(screen.getByText(/VK ID didn't share an email address/)).toBeInTheDocument();
      expect(mocks.signInWithOtp).not.toHaveBeenCalled();
      const input = screen.getByLabelText("Email");
      expect(input).toHaveAttribute("type", "email");
      expect(input).toBeRequired();
      fireEvent.change(input, { target: { value: " New@Mail.ru " } });
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));
      expect(await screen.findByText("Check your email")).toBeInTheDocument();
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        email: "new@mail.ru",
        options: expect.objectContaining({ shouldCreateUser: true, data: { full_name: "Иван Петров", passwordless: true } }),
      });
      fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "482913" } });
      expect((await location()).textContent).toBe("/onboarding");
      expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "new@mail.ru", token: "482913", type: "email" });
      expect(mocks.invoke).toHaveBeenLastCalledWith("vk-auth", { body: { action: "confirm", token: "t1" } });
      expect(mocks.trackEventOncePerUser).toHaveBeenCalledWith("registration_complete", expect.objectContaining({ method: "vk" }));
    });

    it("an address of an existing account leads into that account", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("need_email", null));
      mocks.invoke.mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
      mocks.verifyOtp.mockResolvedValue({
        data: { session: { user: { ...USER, email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date().toISOString() } } },
        error: null,
      });
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "ivan@mail.ru" } });
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));
      fireEvent.change(await screen.findByLabelText("Code from email"), { target: { value: "482913" } });
      expect((await location()).textContent).toBe("/home");
      expect(mocks.trackEventOncePerUser).not.toHaveBeenCalledWith("registration_complete", expect.anything());
    });

    it("«Change email» goes back with the same address", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("need_email", null));
      renderCallback();
      fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "ivan@mail.ru" } });
      fireEvent.click(screen.getByRole("button", { name: "Get code" }));
      fireEvent.click(await screen.findByRole("button", { name: "Change email" }));
      expect(await screen.findByLabelText("Email")).toHaveValue("ivan@mail.ru");
    });

    it("cancel returns to the login page and creates nothing", async () => {
      startedAttempt();
      mocks.invoke.mockResolvedValueOnce(proof("need_email", null));
      renderCallback();
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      expect((await location()).textContent).toBe("/auth/login");
      expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    });
  });

  it("the email of an existing account asks for its password with VK ID named", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue(proof("password"));
    renderCallback();
    expect(await screen.findByText("Account already exists")).toBeInTheDocument();
    expect(screen.getByText("An account with ivan@mail.ru already exists. Enter its password to sign in with VK ID from now on.")).toBeInTheDocument();
  });

  it("a passwordless account gets the code with VK ID named", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValue(proof("code"));
    renderCallback();
    expect(await screen.findByText("An account with ivan@mail.ru already exists. Enter the code from the email to sign in with VK ID from now on.")).toBeInTheDocument();
  });

  it("another VK ID on the account is named after the proof", async () => {
    startedAttempt();
    mocks.invoke.mockResolvedValueOnce(proof("password"));
    mocks.invoke.mockResolvedValueOnce({ data: { outcome: "has_vk" }, error: null });
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { user: USER } }, error: null });
    renderCallback();
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await location()).textContent).toBe("/home");
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Another VK ID is already linked to this account. Unlink it in Settings and try again.",
      variant: "destructive",
    });
  });

  it("linking returns to Security with the result", async () => {
    startedAttempt("link");
    mocks.invoke.mockResolvedValue({ data: { outcome: "linked", next: null }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/settings?tab=security&vk=linked");
  });

  it("a VK account of someone else comes back as taken", async () => {
    startedAttempt("link");
    mocks.invoke.mockResolvedValue({ data: { outcome: "taken" }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/settings?tab=security&vk=taken");
  });

  it("a second VK ID comes back as has_vk", async () => {
    startedAttempt("link");
    mocks.invoke.mockResolvedValue({ data: { outcome: "has_vk" }, error: null });
    renderCallback();
    expect((await location()).textContent).toBe("/settings?tab=security&vk=has_vk");
  });
});
