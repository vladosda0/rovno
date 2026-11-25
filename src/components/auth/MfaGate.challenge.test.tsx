import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { MfaGate } from "@/components/auth/MfaGate";
import MfaChallenge from "@/pages/auth/MfaChallenge";
import { __unsafeResetRuntimeAuthForTests, __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

// The gate and the code screen together: a stale «second step owed» must never bounce the
// person between a page and /auth/mfa (round 2 of the slice-4 review measured such a loop).

const { auth, invokeMock } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    signOut: vi.fn(),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn() },
  },
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth, functions: { invoke: invokeMock } } }));
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: vi.fn(),
}));

const visits: string[] = [];

function Page() {
  const location = useLocation();
  useEffect(() => {
    visits.push(location.pathname);
  }, [location.pathname]);
  return <p data-testid="page">{location.pathname}</p>;
}

function Track() {
  const location = useLocation();
  useEffect(() => {
    visits.push(location.pathname);
  }, [location.pathname]);
  return null;
}

const token = (aal: string) => `h.${btoa(JSON.stringify({ aal, sub: "u1" })).replace(/=+$/, "")}.s`;

function signIn(factors: { id: string; status: string }[]) {
  const user = { id: "u1", factors } as unknown as User;
  __unsafeSetRuntimeAuthStateForTests({
    status: "authenticated",
    session: { user, access_token: token("aal1") } as unknown as Session,
    user,
    profileId: "u1",
  });
}

const owed = { data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null };
const clear = { data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null };

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <MfaGate>
        <Track />
        <Routes>
          <Route path="/auth/mfa" element={<MfaChallenge />} />
          <Route path="*" element={<Page />} />
        </Routes>
      </MfaGate>
    </MemoryRouter>,
  );
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)));

describe("MfaGate around MfaChallenge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    visits.length = 0;
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    auth.refreshSession.mockResolvedValue({ data: {}, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f1", factor_type: "totp", status: "verified", created_at: "x" }] }, error: null });
    signIn([{ id: "f1", status: "verified" }]);
  });
  afterEach(() => __unsafeResetRuntimeAuthForTests());

  it("a recovery code, then «Later»: the person lands on the page once, even if the session still lists the factor", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(owed);
    renderAt("/home");
    fireEvent.click(await screen.findByRole("button", { name: "No access to your phone? Enter a recovery code" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "7k2mq-x9fdr" } });
    // From here Auth no longer owes the step; the runtime session object is left stale on purpose.
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(clear);
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent("/home"));
    await settle();
    expect(screen.getByTestId("page")).toHaveTextContent("/home");
    expect(visits.filter((p) => p === "/auth/mfa").length).toBe(1);
  });

  it("the factor vanished (used up in another tab): the code screen lets the person on, no bounce", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(owed).mockResolvedValueOnce(owed).mockResolvedValue(clear);
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    renderAt("/project/7");
    await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent("/project/7"));
    await settle();
    expect(screen.getByTestId("page")).toHaveTextContent("/project/7");
    expect(visits.filter((p) => p === "/auth/mfa").length).toBe(1);
  });

  it("the gate asks again when the verified factors change, not on a new object with the same ones", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(owed);
    renderAt("/auth/mfa");
    expect(await screen.findByLabelText("Code from the app")).toBeInTheDocument();
    await settle();
    const before = auth.mfa.getAuthenticatorAssuranceLevel.mock.calls.length;
    await act(async () => signIn([{ id: "f1", status: "verified" }]));
    await settle();
    expect(auth.mfa.getAuthenticatorAssuranceLevel.mock.calls.length).toBe(before);
    await act(async () => signIn([]));
    await settle();
    expect(auth.mfa.getAuthenticatorAssuranceLevel.mock.calls.length).toBeGreaterThan(before);
  });
});
