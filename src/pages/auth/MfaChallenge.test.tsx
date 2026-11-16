import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import MfaChallenge from "@/pages/auth/MfaChallenge";

const { auth, invokeMock, toastMock } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    signOut: vi.fn(),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn() },
  },
  invokeMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth, functions: { invoke: invokeMock } } }));
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastMock,
}));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/mfa" element={<MfaChallenge />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MfaChallenge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    auth.refreshSession.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f1", factor_type: "totp", status: "verified", created_at: "x" }] }, error: null });
  });

  it("six digits from the app let the person in, where they were going", async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    renderAt("/auth/mfa?next=%2Fproject%2F7");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482-913" } });
    expect(screen.getByRole("heading", { name: "Two-factor authentication" })).toBeInTheDocument();
    await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "482913" }));
    expect(await screen.findByTestId("where")).toHaveTextContent("/project/7");
    expect(toastMock).toHaveBeenCalledWith({ title: "Welcome back!", description: expect.any(String) });
  });

  it("after the six digits a VK ID waiting from the sign-in is linked and said so", async () => {
    sessionStorage.setItem("rovno.external-link-after-mfa", JSON.stringify({ provider: "vk", token: "t1", userId: "u1", savedAt: Date.now() }));
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    invokeMock.mockResolvedValue({ data: { outcome: "linked", next: null }, error: null });
    renderAt("/auth/mfa?next=%2Fhome");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482913" } });
    expect(await screen.findByTestId("where")).toHaveTextContent("/home");
    expect(invokeMock).toHaveBeenCalledWith("vk-auth", { body: { action: "confirm", token: "t1" } });
    expect(toastMock).toHaveBeenCalledWith({ title: "VK ID linked" });
    expect(sessionStorage.getItem("rovno.external-link-after-mfa")).toBeNull();
  });

  it("a Yandex ID link refused after the six digits is said, and the person still goes in", async () => {
    sessionStorage.setItem("rovno.external-link-after-mfa", JSON.stringify({ provider: "yandex", token: "t2", userId: "u1", savedAt: Date.now() }));
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    invokeMock.mockResolvedValue({ data: { outcome: "failed", reason: "expired" }, error: null });
    renderAt("/auth/mfa?next=%2Fhome");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482913" } });
    expect(await screen.findByTestId("where")).toHaveTextContent("/home");
    expect(invokeMock).toHaveBeenCalledWith("yandex-auth", { body: { action: "confirm", token: "t2" } });
    expect(toastMock).toHaveBeenCalledWith({ title: "Yandex sign-in wasn't completed. Try again or sign in with a code from email.", variant: "destructive" });
  });

  it("a link waiting for another account is not used", async () => {
    sessionStorage.setItem("rovno.external-link-after-mfa", JSON.stringify({ provider: "vk", token: "t1", userId: "someone-else", savedAt: Date.now() }));
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    renderAt("/auth/mfa?next=%2Fhome");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482913" } });
    expect(await screen.findByTestId("where")).toHaveTextContent("/home");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("no verified factor left (a recovery code used in another tab): a fresh session lets the person on", async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel
      .mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null })
      .mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
    renderAt("/auth/mfa?next=%2Fproject%2F7");
    expect(await screen.findByTestId("where")).toHaveTextContent("/project/7");
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it("the factor cannot be read: the code field says so instead of doing nothing", async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: null, error: { message: "network" } });
    renderAt("/auth/mfa");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482913" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("a stale waiting link is not used", async () => {
    sessionStorage.setItem("rovno.external-link-after-mfa", JSON.stringify({ provider: "vk", token: "t1", userId: "u1", savedAt: Date.now() - 16 * 60_000 }));
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    renderAt("/auth/mfa?next=%2Fhome");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482913" } });
    expect(await screen.findByTestId("where")).toHaveTextContent("/home");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("a wrong code is said in words, and the person stays on the step", async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { status: 422, code: "mfa_verification_failed" } });
    renderAt("/auth/mfa");
    fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "000000" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work. Enter a new code from the app.");
    expect(screen.queryByTestId("where")).not.toBeInTheDocument();
  });

  it("a recovery code lets in by turning the protection off, then offers to turn it on again", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    renderAt("/auth/mfa?next=%2Fhome");
    fireEvent.click(await screen.findByRole("button", { name: "No access to your phone? Enter a recovery code" }));
    expect(screen.getByText(/Signing in turns the protection off/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "7K2MQ X9FDR" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mfa-recovery", { body: { action: "redeem", code: "7K2MQ X9FDR" } }));
    expect(auth.refreshSession).toHaveBeenCalled();
    expect(await screen.findByText("Protection is off")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn on again" }));
    expect(await screen.findByTestId("where")).toHaveTextContent("/settings?tab=security&mfa=enable");
  });

  it("a recovery code also finishes a waiting link: it proves the account as well as the app", async () => {
    sessionStorage.setItem("rovno.external-link-after-mfa", JSON.stringify({ provider: "vk", token: "t1", userId: "u1", savedAt: Date.now() }));
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null }).mockResolvedValueOnce({ data: { outcome: "linked", next: null }, error: null });
    renderAt("/auth/mfa?next=%2Fhome");
    fireEvent.click(await screen.findByRole("button", { name: "No access to your phone? Enter a recovery code" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "7k2mq-x9fdr" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Protection is off")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenLastCalledWith("vk-auth", { body: { action: "confirm", token: "t1" } });
    expect(toastMock).toHaveBeenCalledWith({ title: "VK ID linked" });
  });

  it("a wrong recovery code and the five-attempt ceiling have their own words", async () => {
    const refusal = (error: string, status: number) => ({
      data: null,
      error: { context: new Response(JSON.stringify({ error }), { status }) },
    });
    invokeMock.mockResolvedValueOnce(refusal("invalid", 400)).mockResolvedValueOnce(refusal("too_many", 429));
    renderAt("/auth/mfa");
    fireEvent.click(await screen.findByRole("button", { name: "No access to your phone? Enter a recovery code" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "zzzzz-zzzzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work. Check it or enter another one.");
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "yyyyy-yyyyy" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 15 minutes.");
  });

  it("«Sign in to another account» signs out and forgets a waiting link", async () => {
    sessionStorage.setItem("rovno.external-link-after-mfa", JSON.stringify({ provider: "vk", token: "t1", userId: "u1", savedAt: Date.now() }));
    renderAt("/auth/mfa");
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to another account" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(await screen.findByTestId("where")).toHaveTextContent("/auth/login");
    expect(sessionStorage.getItem("rovno.external-link-after-mfa")).toBeNull();
  });

  it("nothing to pass: straight on; no session: to sign-in", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    const { unmount } = renderAt("/auth/mfa?next=%2Fsettings");
    expect(await screen.findByTestId("where")).toHaveTextContent("/settings");
    unmount();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    renderAt("/auth/mfa?next=%2Fsettings");
    expect(await screen.findByTestId("where")).toHaveTextContent("/auth/login?next=%2Fsettings");
  });
});
